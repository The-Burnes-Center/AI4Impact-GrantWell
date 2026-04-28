/**
 * Draft Pipeline - Generate Section Lambda
 *
 * Generates content for ONE grant section using Bedrock structured output.
 * Atomically updates the DDB job with the section content and increments
 * the completedSectionCount.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

const CLAUDE_MODEL_ID = process.env.SONNET_MODEL_ID;

export const handler = async (event) => {
  console.log('GenerateSection: event received', JSON.stringify(event));

  const {
    sectionItem,
    jobId,
    query,
    documentIdentifier,
    projectBasics,
    questionnaire,
    grantInfos,
    totalSections,
    userState,
  } = event;

  const { item: sectionName, description: sectionDescription, index: sectionIndex } = sectionItem;

  console.log(`GenerateSection: generating "${sectionName}" (${sectionIndex + 1}/${totalSections})`);

  const STATE_NAMES = { CA: "California", CO: "Colorado", RI: "Rhode Island" };
  const stateName = userState ? (STATE_NAMES[userState] || userState) : "";
  const stateContextBlock = stateName
    ? `<applicant_context>
The applicant is based in ${stateName}. Where relevant, reference state-appropriate
agencies, programs, demographics, and regulatory framing for ${stateName}. Do not
fabricate state-specific details that aren't supported by the grant_knowledge_base
or project_basics.
</applicant_context>

`
    : "";

  // Build the single-section prompt
  const prompt = `<role>
You are an expert grant writing assistant. Generate a complete, personalized draft for the following grant application section.
</role>

${stateContextBlock}<user_query>
${query}
</user_query>

<project_basics>
${JSON.stringify(projectBasics, null, 2)}
</project_basics>

<questionnaire_responses>
${JSON.stringify(questionnaire, null, 2)}
</questionnaire_responses>

<grant_knowledge_base>
${(grantInfos || []).map((grant) => `<grant_entry id="${grant.grantId}">\n${grant.combinedContent}\n</grant_entry>`).join('\n')}
</grant_knowledge_base>

<section_to_write>
<title>${sectionName}</title>
<description>${sectionDescription}</description>
</section_to_write>

<instructions>
Write ONLY the content for the section described above. Follow the NOFO description exactly and:
1. Personalize using specific details from project_basics and questionnaire_responses — no generic filler
2. Integrate relevant requirements and best practices from grant_knowledge_base
3. Include measurable outcomes and evaluation methods where applicable
4. Address the user's query where relevant
5. Write a thorough, complete section that would be ready for review

Return the section content as a single string via the write_section tool.
</instructions>`;

  const schema = {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: `Complete draft content for the "${sectionName}" section`,
      },
    },
    required: ['content'],
  };

  const result = await invokeStructuredOutput(bedrockClient, {
    modelId: CLAUDE_MODEL_ID,
    prompt,
    schema,
    toolName: 'write_section',
    toolDescription: `Write the content for the "${sectionName}" grant section`,
    maxTokens: 1500,
  });

  const content = result.content || '';
  console.log(`GenerateSection: generated ${content.length} chars for "${sectionName}"`);

  // Atomically write section content and increment counter in DDB
  await updateSectionInJob(jobId, sectionName, content);

  return {
    sectionName,
    content,
    status: 'completed',
  };
};

// ── Helpers ──────────────────────────────────────────────────────────

async function invokeStructuredOutput(client, { modelId, prompt, schema, toolName, toolDescription, maxTokens, temperature = 0 }) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    messages: [{ role: 'user', content: prompt }],
    tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
    tool_choice: { type: 'tool', name: toolName },
    max_tokens: maxTokens,
    temperature,
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  });

  const response = await client.send(command);
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  const toolBlock = parsed.content?.find((b) => b.type === 'tool_use');

  if (!toolBlock?.input) {
    throw new Error(`Model did not return structured tool output for ${toolName}`);
  }
  return toolBlock.input;
}

async function updateSectionInJob(jobId, sectionName, content) {
  const tableName = process.env.DRAFT_GENERATION_JOBS_TABLE_NAME;
  if (!tableName) return;

  try {
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: 'SET #sections.#sectionName = :content ADD #completed :one',
      ExpressionAttributeNames: {
        '#sections': 'sections',
        '#sectionName': sectionName,
        '#completed': 'completedSectionCount',
      },
      ExpressionAttributeValues: {
        ':content': { S: content },
        ':one': { N: '1' },
      },
    });
    await dynamoClient.send(command);
    console.log(`GenerateSection: saved "${sectionName}" to job ${jobId}`);
  } catch (error) {
    console.error(`GenerateSection: error saving "${sectionName}" for job ${jobId}:`, error);
    throw error;
  }
}
