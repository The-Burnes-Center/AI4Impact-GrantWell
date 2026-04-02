/**
 * Draft Pipeline - Assemble Lambda
 *
 * Final step: merges per-section results from the Map state, determines
 * the overall job status, and writes the final state to DDB.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

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

  // Write final state to DDB
  await finalizeJob(jobId, sections, status, failedSections);

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
