/**
 * Draft Pipeline - Prepare Lambda
 *
 * Fetches the NOFO summary and splits the work into N section items for the
 * Step Functions Map state to fan out; each section retrieves its own
 * passages. `sectionIds` limits the run to those sections (a retry of the
 * ones that failed); the outline every writer sees stays the whole
 * application. Updates the DDB job with sectionNames and totalSections.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { getArtifact, withSectionIds } from 'grantwell-shared';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event) => {
  const {
    jobId, query, documentIdentifier, projectBasics, questionnaire, questionnaireAnswers,
    additionalInfo, sessionId, userId, userState, sectionIds,
  } = event;

  console.log(`Prepare: job ${jobId} for "${documentIdentifier}" (session ${sessionId})`);

  // 1. Fetch NOFO summary from S3
  const summary = await getSummaryFile(documentIdentifier);
  if (!summary || !summary.ProjectNarrativeSections || summary.ProjectNarrativeSections.length === 0) {
    throw new Error('Failed to get grant sections from requirements — ProjectNarrativeSections missing or empty');
  }

  // 2. Build section list
  const outline = withSectionIds(summary.ProjectNarrativeSections).map((section, index) => ({
    id: section.id,
    item: section.item,
    description: section.description,
    index,
  }));
  const wanted = Array.isArray(sectionIds) && sectionIds.length > 0 ? new Set(sectionIds) : null;
  const sections = wanted ? outline.filter((s) => wanted.has(s.id)) : outline;
  if (sections.length === 0) {
    throw new Error('None of the requested sections are in this grant\'s requirements');
  }

  const sectionNames = outline.map((s) => s.item);
  const outlineRefs = outline.map((s) => ({ id: s.id, name: s.item }));
  const totalSections = sections.length;

  // 3. Update DDB job with section metadata
  await updateJobMetadata(jobId, sections.map((s) => s.item), sections.map((s) => s.id), totalSections);

  // 4. Return payload for the Map state
  return {
    jobId,
    query,
    documentIdentifier,
    projectBasics: projectBasics || {},
    questionnaire: questionnaire || {},
    questionnaireAnswers: Array.isArray(questionnaireAnswers) ? questionnaireAnswers : [],
    additionalInfo: typeof additionalInfo === "string" ? additionalInfo : "",
    sessionId,
    userId,
    userState: typeof userState === "string" ? userState : "",
    totalSections,
    sections,
    sectionNames,
    outline: outlineRefs,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────

async function getSummaryFile(documentIdentifier) {
  try {
    const response = await getArtifact(s3Client, `${documentIdentifier}summary.json`);
    const content = await response.Body.transformToString();
    return JSON.parse(content);
  } catch (error) {
    console.error('Error getting summary file:', error);
    return null;
  }
}

async function updateJobMetadata(jobId, sectionNames, sectionIds, totalSections) {
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  if (!tableName) return;

  try {
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: 'SET #sn = :sn, #si = :si, #ts = :ts, #cc = :zero',
      ExpressionAttributeNames: {
        '#sn': 'sectionNames',
        '#si': 'sectionIds',
        '#ts': 'totalSections',
        '#cc': 'completedSectionCount',
      },
      ExpressionAttributeValues: marshall({
        ':sn': sectionNames,
        ':si': sectionIds,
        ':ts': totalSections,
        ':zero': 0,
      }),
    });
    await dynamoClient.send(command);
    console.log(`Prepare: updated job ${jobId} metadata (${totalSections} sections)`);
  } catch (error) {
    console.error(`Prepare: error updating job metadata for ${jobId}:`, error);
  }
}
