/**
 * Draft Pipeline - Prepare Lambda
 *
 * Fetches the NOFO summary and KB documents, then splits the work into
 * N section items for the Step Functions Map state to fan out.
 * Updates the DDB job with sectionNames and totalSections.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('Prepare: event received', JSON.stringify(event));

  const { jobId, query, documentIdentifier, projectBasics, questionnaire, sessionId, userId } = event;

  // 1. Fetch NOFO summary from S3
  const summary = await getSummaryFile(documentIdentifier);
  if (!summary || !summary.ProjectNarrativeSections || summary.ProjectNarrativeSections.length === 0) {
    throw new Error('Failed to get NOFO sections from summary — ProjectNarrativeSections missing or empty');
  }

  // 2. Retrieve relevant docs from Knowledge Base (filtered by document)
  const kbResults = await retrieveFromKnowledgeBase(query, documentIdentifier);
  const grantInfos = extractGrantInfoFromKBResults(kbResults);
  console.log(`Prepare: fetched ${grantInfos.length} KB results`);

  // 3. Build section list
  const sections = summary.ProjectNarrativeSections.map((section, index) => ({
    item: section.item,
    description: section.description,
    index,
  }));

  const sectionNames = sections.map((s) => s.item);
  const totalSections = sections.length;

  // 4. Update DDB job with section metadata
  await updateJobMetadata(jobId, sectionNames, totalSections);

  // 5. Return payload for the Map state
  return {
    jobId,
    query,
    documentIdentifier,
    projectBasics: projectBasics || {},
    questionnaire: questionnaire || {},
    sessionId,
    userId,
    grantInfos,
    totalSections,
    sections,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────

async function getSummaryFile(documentIdentifier) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET,
      Key: `${documentIdentifier}summary.json`,
    });
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString();
    return JSON.parse(content);
  } catch (error) {
    console.error('Error getting summary file:', error);
    return null;
  }
}

async function retrieveFromKnowledgeBase(query, documentIdentifier) {
  try {
    const filter = {
      and: [
        { equals: { key: 'metadataAttributes.documentType', value: 'NOFO' } },
        { equals: { key: 'metadataAttributes.documentIdentifier', value: documentIdentifier } },
      ],
    };

    const command = new RetrieveCommand({
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 10,
          filter,
        },
      },
    });

    const response = await kbClient.send(command);
    return response.retrievalResults || [];
  } catch (error) {
    console.error('Error retrieving from Knowledge Base:', error);
    return [];
  }
}

function extractGrantInfoFromKBResults(results) {
  return results.map((result) => ({
    grantId: result.metadata?.grantId || 'unknown',
    combinedContent: result.content,
  }));
}

async function updateJobMetadata(jobId, sectionNames, totalSections) {
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  if (!tableName) return;

  try {
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: 'SET #sn = :sn, #ts = :ts, #cc = :zero',
      ExpressionAttributeNames: {
        '#sn': 'sectionNames',
        '#ts': 'totalSections',
        '#cc': 'completedSectionCount',
      },
      ExpressionAttributeValues: marshall({
        ':sn': sectionNames,
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
