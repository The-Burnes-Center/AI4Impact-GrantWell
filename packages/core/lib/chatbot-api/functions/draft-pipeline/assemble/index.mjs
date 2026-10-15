/**
 * Draft Pipeline - Assemble Lambda
 *
 * Final step: merges per-section results, determines the overall job status,
 * and writes the final state to DDB. Sections are keyed by id. A section the
 * user saved after the job was created keeps the user's text: the editor is
 * read-only while generation runs, so such a save came from somewhere the lock
 * could not reach (another tab, an older page), and it is the newer work.
 */

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { normalizeApplicationSections } from 'grantwell-shared';

const MAX_DRAFT_WRITE_ATTEMPTS = 3;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event) => {
  const { jobId, sessionId, userId, sectionResults, totalSections, outline } = event;

  console.log(`Assemble: job ${jobId} (session ${sessionId}), ${sectionResults?.length ?? 0} results`);

  // Content comes from the job row, not the Map payload (SFN 256 KB limit).
  const { sections: generatedSections, createdAt } = await fetchJob(jobId);

  const sections = {};
  const failedSections = [];
  let completedCount = 0;

  for (const result of sectionResults || []) {
    const sectionId = result.sectionId || result.sectionName;
    const content = generatedSections[sectionId];
    if (result.status === 'completed' && typeof content === 'string' && content.trim() !== '') {
      sections[sectionId] = content;
      completedCount++;
    } else {
      failedSections.push(sectionId);
    }
  }

  // Determine final status
  let status;
  if (completedCount === 0) {
    status = 'error';
  } else if (failedSections.length > 0) {
    status = 'partial';
  } else {
    status = 'completed';
  }

  console.log(`Assemble: job ${jobId} — ${completedCount}/${totalSections} sections, status=${status}`);

  // The draft row is written here rather than by the browser, so the transition
  // out of "generating_draft" does not depend on anyone watching. It lands
  // before the job is marked done, so a client that sees the job finish and
  // reads the draft gets the merged result.
  await finalizeDraft(userId, sessionId, sections, status, outline, createdAt);
  await finalizeJob(jobId, sections, status, failedSections);

  return {
    jobId,
    status,
    sectionsGenerated: completedCount,
    sectionsFailed: failedSections.length,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchJob(jobId) {
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  if (!tableName) return { sections: {}, createdAt: null };

  const result = await dynamoClient.send(new GetItemCommand({
    TableName: tableName,
    Key: { jobId: { S: jobId } },
    ProjectionExpression: 'sections, createdAt',
  }));

  const job = result.Item ? unmarshall(result.Item) : {};
  if (!job.sections) console.warn(`Assemble: job ${jobId} has no stored sections`);
  return { sections: job.sections || {}, createdAt: job.createdAt || null };
}

function savedAfter(savedAt, startedAt) {
  const saved = Date.parse(savedAt);
  const started = Date.parse(startedAt);
  return Number.isFinite(saved) && Number.isFinite(started) && saved > started;
}

async function finalizeJob(jobId, sections, status, failedSections) {
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  if (!tableName) return;

  try {
    const updates = {
      sections,
      status,
      completedAt: new Date().toISOString(),
    };

    if (failedSections.length > 0) {
      updates.failedSections = failedSections;
    }

    // Build dynamic update expression
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    Object.keys(updates).forEach((key, index) => {
      const valueKey = `:val${index}`;
      const nameKey = `#name${index}`;
      updateExpressions.push(`${nameKey} = ${valueKey}`);
      expressionAttributeValues[valueKey] = updates[key];
      expressionAttributeNames[nameKey] = key;
    });

    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    await dynamoClient.send(command);
    console.log(`Assemble: finalized job ${jobId} with status=${status}`);
  } catch (error) {
    console.error(`Assemble: error finalizing job ${jobId}:`, error);
    throw error;
  }
}

async function finalizeDraft(userId, sessionId, newSections, jobStatus, outline, startedAt) {
  const tableName = process.env.DRAFT_TABLE_NAME;
  if (!tableName) {
    console.warn('Assemble: DRAFT_TABLE_NAME not set, skipping draft finalization');
    return;
  }
  if (!userId || !sessionId) {
    console.warn('Assemble: missing userId/sessionId, skipping draft finalization');
    return;
  }

  const draftStatus = jobStatus === 'error' ? 'questionnaire' : 'editing_sections';
  const key = { user_id: { S: userId }, session_id: { S: sessionId } };

  try {
    for (let attempt = 1; attempt <= MAX_DRAFT_WRITE_ATTEMPTS; attempt++) {
      const existing = await dynamoClient.send(new GetItemCommand({
        TableName: tableName,
        Key: key,
        ConsistentRead: true,
        ProjectionExpression: 'sections, section_order, section_saved_at, #rev',
        ExpressionAttributeNames: { '#rev': 'rev' },
      }));
      const row = existing.Item ? unmarshall(existing.Item) : null;
      if (!row) {
        console.warn(`Assemble: no existing draft for ${userId}/${sessionId} — writing job results anyway`);
      }

      const { sections: prior, order } = normalizeApplicationSections(
        row?.sections, row?.section_order, outline || []
      );
      const savedAt = row?.section_saved_at || {};
      const merged = { ...prior };
      const kept = [];
      for (const [sectionId, text] of Object.entries(newSections)) {
        if (savedAfter(savedAt[sectionId], startedAt)) {
          kept.push(sectionId);
          continue;
        }
        merged[sectionId] = text;
      }

      const names = { '#sec': 'sections', '#so': 'section_order', '#st': 'status', '#lm': 'last_modified', '#lws': 'last_write_source', '#rev': 'rev' };
      const values = {
        ':sections': merged,
        ':order': order,
        ':status': draftStatus,
        ':lm': new Date().toISOString(),
        ':lws': 'ai_generated',
        ':revZero': 0,
        ':revOne': 1,
      };
      let condition;
      if (row) {
        if (typeof row.rev === 'number') {
          condition = '#rev = :readRev';
          values[':readRev'] = row.rev;
        } else {
          condition = 'attribute_not_exists(#rev)';
        }
      }

      try {
        // Unconditional bump so revs stay coherent across both writers.
        await dynamoClient.send(new UpdateItemCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: 'SET #sec = :sections, #so = :order, #st = :status, #lm = :lm, #lws = :lws, #rev = if_not_exists(#rev, :revZero) + :revOne',
          ...(condition ? { ConditionExpression: condition } : {}),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: marshall(values),
        }));
      } catch (error) {
        if (error.name === 'ConditionalCheckFailedException' && attempt < MAX_DRAFT_WRITE_ATTEMPTS) continue;
        throw error;
      }

      if (kept.length > 0) {
        console.log(`Assemble: kept the user's text in ${kept.length} section(s) saved after generation started`);
      }
      console.log(`Assemble: finalized draft ${userId}/${sessionId} with status=${draftStatus}`);
      return;
    }
  } catch (error) {
    // Don't fail the whole step — the jobs table still has the data and the
    // frontend's polling fallback can still pick it up.
    console.error(`Assemble: error finalizing draft ${userId}/${sessionId}:`, error);
  }
}
