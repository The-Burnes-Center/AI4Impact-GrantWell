/**
 * Draft Generator Lambda Function
 *
 * Generates grant application draft sections using Bedrock + Knowledge Base.
 * Invoked asynchronously by the draft-generation job dispatcher; writes results
 * to DynamoDB for the frontend to poll via /draft-generation-jobs/{jobId}.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

// Define model IDs
const CLAUDE_MODEL_ID = process.env.SONNET_MODEL_ID;

export const handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));
  return await handleAsyncDraftGeneration(event);
};

/**
 * Handle async draft generation invocation
 */
async function handleAsyncDraftGeneration(event) {
  const { jobId, query, documentIdentifier, projectBasics, questionnaire } = event;
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;

  console.log(`[Async Draft] Starting for job ${jobId}`);

  try {
    // Generate sections based on project basics, questionnaire and KB content
    const sections = await generateSections(
      query,
      projectBasics || {},
      questionnaire || {},
      documentIdentifier
    );
    
    console.log(`[Async Draft] Generated sections for job ${jobId}:`, JSON.stringify(sections, null, 2));
    
    // Update job status in DynamoDB
    if (tableName) {
      await updateJobStatus(jobId, {
        status: 'completed',
        sections,
        completedAt: new Date().toISOString()
      });
    }
    
    return { success: true, sectionsCount: Object.keys(sections).length };
  } catch (error) {
    console.error(`[Async Draft] Error for job ${jobId}:`, error);
    
    // Update job status with error
    if (tableName) {
      await updateJobStatus(jobId, {
        status: 'error',
        error: error.message,
        completedAt: new Date().toISOString()
      });
    }
    
    throw error;
  }
}

/**
 * Update job status in DynamoDB
 */
async function updateJobStatus(jobId, updates) {
  try {
    const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
    if (!tableName) {
      console.warn('DRAFT_GENERATION_JOBS_TABLE_NAME not configured');
      return;
    }
    
    // Build update expression
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
      Key: {
        jobId: { S: jobId }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues)
    });
    
    await dynamoClient.send(command);
    console.log(`[Job ${jobId}] Updated job status in DynamoDB`);
  } catch (error) {
    console.error(`[Job ${jobId}] Error updating job status:`, error);
    // Don't throw - job processing can continue
  }
}

/**
 * Generate sections based on project basics, questionnaire and KB content
 */
async function generateSections(query, projectBasics, questionnaire, documentIdentifier, sessionId) {
  try {
    // 1. First, retrieve relevant documents from Knowledge Base
    const kbResults = await retrieveFromKnowledgeBase(query, documentIdentifier);
    console.log('KB Results:', JSON.stringify(kbResults, null, 2));
    if (!kbResults || kbResults.length === 0) {
      console.log('No results from Knowledge Base for query:', query);
      return {};
    }
    
    // 2. Extract grant information from the KB results
    const grantInfos = extractGrantInfoFromKBResults(kbResults);
    console.log('Extracted grantInfos:', JSON.stringify(grantInfos, null, 2));
    
    // 3. Use Bedrock to analyze and generate sections
    const sections = await analyzeAndGenerateSections(
      query,
      grantInfos,
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId
    );
    console.log('Sections from Bedrock:', JSON.stringify(sections, null, 2));
    
    return sections;
  } catch (error) {
    console.error('Error generating sections:', error);
    return {};
  }
}

/**
 * Retrieve relevant documents from Knowledge Base
 */
async function retrieveFromKnowledgeBase(query, documentIdentifier) {
  try {
    const params = {
      knowledgeBaseId: process.env.KB_ID,
      retrievalQuery: {
        text: query
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 5
        }
      }
    };

    const command = new RetrieveCommand(params);
    const response = await kbClient.send(command);
    
    return response.retrievalResults || [];
  } catch (error) {
    console.error('Error retrieving from Knowledge Base:', error);
    return [];
  }
}

async function invokeStructuredOutput(client, { modelId, prompt, schema, toolName, toolDescription, maxTokens, temperature = 0 }) {
  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const response = await client.send(command);
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  const toolBlock = parsed.content?.find((b) => b.type === "tool_use");

  if (!toolBlock?.input) {
    throw new Error(`Model did not return structured tool output for ${toolName}`);
  }
  return toolBlock.input;
}

/**
 * Analyze and generate sections using Bedrock
 */
async function analyzeAndGenerateSections(query, grantInfos, projectBasics, questionnaire, documentIdentifier, sessionId) {
  // Get NOFO summary to get the sections
  const summary = await getSummaryFile(documentIdentifier);
  if (!summary || !summary.ProjectNarrativeSections) {
    throw new Error('Failed to get NOFO sections from summary');
  }

  // Create a prompt for Bedrock to analyze and generate sections
  const prompt = `<role>
You are an expert grant writing assistant. Generate a complete, personalized grant application draft for each required NOFO section.
</role>

<user_query>
${query}
</user_query>

<project_basics>
${JSON.stringify(projectBasics, null, 2)}
</project_basics>

<questionnaire_responses>
${JSON.stringify(questionnaire, null, 2)}
</questionnaire_responses>

<grant_knowledge_base>
${grantInfos.map((grant) => `<grant_entry id="${grant.grantId}">\n${grant.combinedContent}\n</grant_entry>`).join('\n')}
</grant_knowledge_base>

<nofo_required_sections>
${summary.ProjectNarrativeSections.map((section, index) => `<section number="${index + 1}">\n<title>${section.item}</title>\n<description>${section.description}</description>\n</section>`).join('\n')}
</nofo_required_sections>

<instructions>
For each section, follow its NOFO description exactly and:
1. Personalize using specific details from project_basics and questionnaire_responses — no generic filler
2. Integrate relevant requirements and best practices from grant_knowledge_base
3. Include measurable outcomes and evaluation methods where applicable
4. Maintain consistent goals, methodology, and outcomes across all sections
5. Address the user's query where relevant
</instructions>`;
  
  const sanitizeKey = (name) =>
    name
      .replace(/[^a-zA-Z0-9_.-]/g, '_') // replace invalid chars with underscore
      .replace(/_{2,}/g, '_')            // collapse consecutive underscores
      .replace(/^_+|_+$/g, '')           // trim leading/trailing underscores
      .substring(0, 64) || 'section';    // enforce max length; fallback if empty

  const sectionProperties = {};
  const requiredSections = [];
  const keyToSectionName = {}; // sanitized key → original section name

  for (const section of summary.ProjectNarrativeSections) {
    const key = sanitizeKey(section.item);
    keyToSectionName[key] = section.item;
    sectionProperties[key] = {
      type: "string",
      description: `Content for "${section.item}": ${section.description}`,
    };
    requiredSections.push(key);
  }

  const draftSchema = {
    type: "object",
    properties: sectionProperties,
    required: requiredSections,
  };

  try {
    const rawSections = await invokeStructuredOutput(bedrockClient, {
      modelId: CLAUDE_MODEL_ID,
      prompt,
      schema: draftSchema,
      toolName: "save_draft_sections",
      toolDescription: "Save the generated grant application draft sections",
      maxTokens: 10000,
    });

    // Remap sanitized keys back to the original human-readable section names
    const sections = {};
    for (const [key, content] of Object.entries(rawSections || {})) {
      sections[keyToSectionName[key] ?? key] = content;
    }
    return sections;
  } catch (error) {
    console.error('Error generating sections with Bedrock:', error);
    return {};
  }
}

/**
 * Extract grant information from KB results
 */
function extractGrantInfoFromKBResults(results) {
  return results.map(result => ({
    grantId: result.metadata?.grantId || 'unknown',
    combinedContent: result.content
  }));
}

/**
 * Get NOFO summary file from S3
 */
async function getSummaryFile(documentIdentifier) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET,
      Key: `${documentIdentifier}summary.json`
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body.transformToString();
    return JSON.parse(content);
  } catch (error) {
    console.error('Error getting summary file:', error);
    return null;
  }
}