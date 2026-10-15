/**
 * Draft Pipeline - Prepare Lambda
 *
 * Fetches the NOFO summary, KB passages from the grant and from the
 * requesting user's supporting documents for that grant, then splits the
 * work into N section items for the Step Functions Map state to fan out.
 * Updates the DDB job with sectionNames and totalSections.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event) => {
  const {
    jobId, query, documentIdentifier, projectBasics, questionnaire, questionnaireAnswers,
    additionalInfo, sessionId, userId, userState,
  } = event;

  console.log(`Prepare: job ${jobId} for "${documentIdentifier}" (session ${sessionId})`);

  // 1. Fetch NOFO summary from S3
  const summary = await getSummaryFile(documentIdentifier);
  if (!summary || !summary.ProjectNarrativeSections || summary.ProjectNarrativeSections.length === 0) {
    throw new Error('Failed to get grant sections from requirements — ProjectNarrativeSections missing or empty');
  }

  // 2. Retrieve relevant passages: the grant, and this user's own uploads for it
  const [kbResults, userDocResults] = await Promise.all([
    retrieveFromKnowledgeBase(query, documentIdentifier),
    retrieveUserDocuments(query, documentIdentifier, userId),
  ]);
  const grantInfos = extractGrantInfoFromKBResults(kbResults);
  const applicantDocuments = extractApplicantDocuments(userDocResults);
  console.log(`Prepare: fetched ${grantInfos.length} KB results, ${applicantDocuments.length} from the applicant's documents`);

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
    questionnaireAnswers: Array.isArray(questionnaireAnswers) ? questionnaireAnswers : [],
    additionalInfo: typeof additionalInfo === "string" ? additionalInfo : "",
    sessionId,
    userId,
    userState: typeof userState === "string" ? userState : "",
    grantInfos,
    applicantDocuments,
    totalSections,
    sections,
    sectionNames,
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
    const normalizedDocumentIdentifier = documentIdentifier.replace(/\/+$/, '');
    const filter = {
      andAll: [
        { equals: { key: 'documentType', value: 'NOFO' } },
        { equals: { key: 'documentIdentifier', value: normalizedDocumentIdentifier } },
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

/** userId must come from the authenticated caller; it scopes retrieval to that user's uploads. */
async function retrieveUserDocuments(query, documentIdentifier, userId) {
  if (!userId) return [];
  const nofoName = documentIdentifier.replace(/\/+$/, '').split('/').pop();
  if (!nofoName) return [];
  try {
    const filter = {
      andAll: [
        { equals: { key: 'documentType', value: 'userDocument' } },
        { equals: { key: 'userId', value: userId } },
        { equals: { key: 'nofoName', value: nofoName } },
      ],
    };

    const command = new RetrieveCommand({
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 5,
          filter,
        },
      },
    });

    const response = await kbClient.send(command);
    const folder = `/${userId}/${nofoName}/`;
    return (response.retrievalResults || []).filter((r) => r.location?.s3Location?.uri?.includes(folder));
  } catch (error) {
    console.error("Error retrieving the applicant's documents from Knowledge Base:", error);
    return [];
  }
}

function extractGrantInfoFromKBResults(results) {
  return results.map((result) => ({
    grantId: result.metadata?.grantId || 'unknown',
    combinedContent: result.content?.text ?? '',
  }));
}

function extractApplicantDocuments(results) {
  return results
    .filter((result) => typeof result.content?.text === 'string' && result.content.text.trim() !== '')
    .map((result) => ({
      fileName: result.metadata?.fileName || result.location?.s3Location?.uri?.split('/').pop() || 'document',
      content: result.content.text,
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
