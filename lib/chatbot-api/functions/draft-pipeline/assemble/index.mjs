/**
 * Draft Pipeline - Assemble Lambda
 *
 * Final step: merges per-section results from the Map state, determines
 * the overall job status, and writes the final state to DDB.
 */

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('Assemble: event received', JSON.stringify(event));

  const { jobId, sessionId, userId, sectionResults, totalSections } = event;

  // Merge results: build sections map and track failures
  const sections = {};
  const failedSections = [];
  let completedCount = 0;

  for (const result of sectionResults || []) {
    if (result.status === 'completed' && result.content) {
      sections[result.sectionName] = result.content;
      completedCount++;
    } else {
      failedSections.push(result.sectionName);
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

  // Write final state to the jobs table and the draft row.
  // The draft row update used to be done client-side from the polling loop in
  // SectionsEditor.tsx; if the user closed the tab before the pipeline finished,
  // the draft was stranded in status="generating_draft" forever. Doing it here
  // makes the transition independent of whether anyone is watching.
  await Promise.all([
    finalizeJob(jobId, sections, status, failedSections),
    finalizeDraft(userId, sessionId, sections, status),
  ]);

  return {
    jobId,
    status,
    sectionsGenerated: completedCount,
    sectionsFailed: failedSections.length,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────

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

async function finalizeDraft(userId, sessionId, newSections, jobStatus) {
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

  try {
    let mergedSections = newSections;
    const existing = await dynamoClient.send(new GetItemCommand({
      TableName: tableName,
      Key: { user_id: { S: userId }, session_id: { S: sessionId } },
      ProjectionExpression: 'sections',
    }));
    if (existing.Item?.sections) {
      const prior = unmarshall({ sections: existing.Item.sections }).sections || {};
      mergedSections = { ...prior, ...newSections };
    } else {
      console.warn(`Assemble: no existing draft for ${userId}/${sessionId} — writing job results anyway`);
    }

    const updates = {
      sections: mergedSections,
      status: draftStatus,
      last_modified: new Date().toISOString(),
    };

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

    await dynamoClient.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { user_id: { S: userId }, session_id: { S: sessionId } },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    }));
    console.log(`Assemble: finalized draft ${userId}/${sessionId} with status=${draftStatus}`);
  } catch (error) {
    // Don't fail the whole step — the jobs table still has the data and the
    // frontend's polling fallback can still pick it up.
    console.error(`Assemble: error finalizing draft ${userId}/${sessionId}:`, error);
  }
}
