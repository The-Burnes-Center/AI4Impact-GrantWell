/**
 * Draft Generator Lambda Function
 * 
 * This function generates a draft for a given query.
 * Supports two modes:
 * 1. Synchronous (legacy): Returns sections directly
 * 2. Asynchronous: Writes results to DynamoDB for polling
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
const CLAUDE_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

/**
 * Main handler function for draft generation
 * Supports two modes:
 * 1. Synchronous (legacy): Returns sections directly
 * 2. Asynchronous: Writes results to DynamoDB for polling
 */
export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event));
    
    // Check if this is an async draft generation invocation
    if (event.asyncDraftGeneration) {
      return await handleAsyncDraftGeneration(event);
    }
    
    // Legacy synchronous mode
    // Parse the incoming request
    let body = {};
    if (event.body) {
      body = JSON.parse(event.body);
    }
    
    const { 
      query, 
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId 
    } = body;
    
    if (!query || !documentIdentifier || !sessionId) {
      console.log('Missing required fields:', { query, documentIdentifier, sessionId });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query, document identifier, and session ID are required' })
      };
    }
    
    console.log('Generating sections with:', { query, projectBasics, questionnaire, documentIdentifier, sessionId });
    // Generate sections based on project basics, questionnaire and KB content
    const sections = await generateSections(
      query,
      projectBasics,
      questionnaire,
      documentIdentifier,
      sessionId
    );
    console.log('Generated sections:', JSON.stringify(sections, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify({ sections })
    };
  } catch (error) {
    console.error('Error processing draft generation:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process draft generation' })
    };
  }
};

/**
 * Handle async draft generation invocation
 */
async function handleAsyncDraftGeneration(event) {
  const { jobId, query, documentIdentifier, projectBasics, questionnaire, sessionId } = event;
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  
  console.log(`[Async Draft] Starting for job ${jobId}`);
  
  try {
    // Generate sections based on project basics, questionnaire and KB content
    const sections = await generateSections(
      query,
      projectBasics || {},
      questionnaire || {},
      documentIdentifier,
      sessionId
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

/**
 * Safely extract a JSON object from an LLM response.
 * Handles markdown code fences, preamble text, and trailing content.
 */
function extractJSON(text) {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch (_) {
    }
  }

  return null;
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
  const prompt = `
    <task_description>
You are an expert grant writing assistant. Your task is to generate a comprehensive, structured grant application draft based on the provided information and requirements.
</task_description>

<input_components>
You will receive the following information:

1. <user_query>
The applicant's specific question or request about their grant application:
${query}
</user_query>

2. <project_basics>
Core information about the project:
${JSON.stringify(projectBasics, null, 2)}
</project_basics>

3. <questionnaire_responses>
Detailed responses from the applicant's questionnaire:
${JSON.stringify(questionnaire, null, 2)}
</questionnaire_responses>

4. <grant_knowledge_base>
Relevant grant information and guidelines from the Knowledge Base:
${grantInfos.map((grant, index) => `
<grant_entry id="${grant.grantId}">
${grant.combinedContent}
</grant_entry>
`).join('\n')}
</grant_knowledge_base>

5. <nofo_required_sections>
The mandatory sections specified in the Notice of Funding Opportunity (NOFO):
${summary.ProjectNarrativeSections.map((section, index) => `
<section number="${index + 1}">
<title>${section.item}</title>
<description>${section.description}</description>
</section>
`).join('\n')}
</nofo_required_sections>
</input_components>

<instructions>
Generate a complete grant application draft following these guidelines:

**Content Development for Each Section:**
1. Address the user's query throughout your response where relevant
2. Personalize content using specific details from the project basics and questionnaire responses
3. Integrate applicable requirements, guidelines, and best practices from the grant knowledge base
4. Ensure alignment with the grant's stated focus areas, priorities, and evaluation criteria
5. Create specific, actionable, and evidence-based content rather than generic statements
6. Strictly follow the section descriptions and requirements provided in the NOFO
7. Maintain consistency across all sections in terms of project goals, methodology, and outcomes
8. Use professional grant writing language and tone

**Quality Standards:**
- Be comprehensive yet concise
- Use concrete examples and data where appropriate
- Demonstrate clear understanding of the funding opportunity
- Show how the project meets the grantor's objectives
- Include measurable outcomes and evaluation methods where applicable
</instructions>

<output_format>
Structure your response as a valid JSON object where:
- Each key is the exact section title from the NOFO (use the precise wording from <title> tags)
- Each value is the complete, well-developed content for that section
- Maintain the order of sections as specified in the NOFO

Example structure:
{"${summary.ProjectNarrativeSections[0].item}": "Comprehensive content addressing all requirements for this section, incorporating project-specific details and grant guidelines...",
  "${summary.ProjectNarrativeSections[1].item}": "Detailed content for the second section, demonstrating alignment with funding priorities...",
  ...
}
</output_format>

<critical_requirements>
- Output ONLY the JSON object with no preamble, explanations, or additional text
- Ensure the JSON is properly formatted and parsable
- Use exact section titles as they appear in the NOFO
- Include all required sections specified in the NOFO
- Do not add sections that are not listed in the NOFO requirements
</critical_requirements>

Provide your JSON response immediately without any preamble:
  `;
  
  const bedrockParams = {
    modelId: CLAUDE_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 10000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '{'
            }
          ]
        }
      ]
    })
  };
  
  try {
    const command = new InvokeModelCommand(bedrockParams);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    
    const rawContent = '{' + responseBody.content[0].text;
    
    const sections = extractJSON(rawContent);
    if (sections) {
      return sections;
    } else {
      console.error('Failed to extract JSON from response:', rawContent.substring(0, 500));
      return {};
    }
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