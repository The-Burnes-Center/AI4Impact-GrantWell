/**
 * Draft Pipeline - Generate Section Lambda
 *
 * Generates content for ONE grant section using Bedrock structured output.
 * Atomically updates the DDB job with the section content and increments
 * the completedSectionCount.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const CLAUDE_MODEL_ID = process.env.SONNET_MODEL_ID;

const WORDS_PER_PAGE = 500;
const DEFAULT_SECTION_WORDS = 800;

function sectionWordBudget(description) {
  const text = typeof description === 'string' ? description : '';
  const byWords = text.match(/(?:not exceed|no more than|maximum of|max(?:imum)?|up to)\s+([\d,]+)\s+words/i);
  if (byWords) return parseInt(byWords[1].replace(/,/g, ''), 10);
  const ownPages = [...text.matchAll(/([\d.]+)[-\s]page/gi)]
    .filter((m) => !/\b(?:overall|within|combined|total|against|count|counts|excluded)\b[^.]{0,60}$/i.test(text.slice(0, m.index)))
    .map((m) => parseFloat(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ownPages.length > 0) return Math.round(Math.min(...ownPages) * WORDS_PER_PAGE);
  return DEFAULT_SECTION_WORDS;
}

function tokenCeilingForWords(words) {
  return Math.min(8000, Math.max(1500, Math.round(words * 2.2) + 400));
}

// SUPPORTED_STATES injected as [{code,name}] (from lib/shared/states.ts). Parsed inline because
// this function does not attach the grantwell-shared Lambda layer.
const STATE_NAME_BY_CODE = (() => {
  try {
    const parsed = JSON.parse(process.env.SUPPORTED_STATES || "[]");
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(
      parsed.filter((s) => s && typeof s.code === "string").map((s) => [s.code, s.name])
    );
  } catch {
    return {};
  }
})();

export const handler = async (event) => {
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
    sectionNames,
  } = event;

  const { item: sectionName, description: sectionDescription, index: sectionIndex } = sectionItem;

  const wordBudget = sectionWordBudget(sectionDescription);
  const maxTokens = tokenCeilingForWords(wordBudget);

  console.log(
    `GenerateSection: generating "${sectionName}" (${sectionIndex + 1}/${totalSections}) ` +
      `budget=${wordBudget}w max_tokens=${maxTokens}`
  );

  const stateName = userState ? (STATE_NAME_BY_CODE[userState] || userState) : "";
  const stateContextBlock = stateName
    ? `<applicant_context>
The applicant is based in ${stateName}. Where relevant, reference state-appropriate
agencies, programs, demographics, and regulatory framing for ${stateName}. Do not
fabricate state-specific details that aren't supported by the grant_knowledge_base
or project_basics.
</applicant_context>

`
    : "";

  const outlineBlock = Array.isArray(sectionNames) && sectionNames.length > 0
    ? `<document_outline>
The full application consists of the sections below. Other sections are being written
separately; write ONLY your assigned section and leave the rest to them.
${sectionNames.map((n, i) => `${i + 1}. ${n}${n === sectionName ? "  <-- YOUR ASSIGNED SECTION" : ""}`).join('\n')}
</document_outline>

`
    : "";

  // Build the single-section prompt
  const prompt = `<role>
You are an expert grant writing assistant. Generate a complete, personalized draft for the following grant application section.
</role>

${outlineBlock}${stateContextBlock}<user_query>
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
<length_budget>Approximately ${wordBudget} words. Do not exceed this.</length_budget>
</section_to_write>

<instructions>
Write ONLY the content for the section described above. Follow the NOFO description exactly and:
1. Personalize using specific details from project_basics and questionnaire_responses — no generic filler
2. Integrate relevant requirements and best practices from grant_knowledge_base
3. Include measurable outcomes and evaluation methods where applicable
4. Address the user's query where relevant
5. Write a complete section that would be ready for review, within the length budget —
   this is one section of a page-limited application, not a standalone document
6. Respect the length budget above; concise and specific beats long and padded
7. Do NOT restate the project title, applicant name, contact details, or requested amount
   as a header block — this section sits inside a larger assembled document that already
   carries them. Start directly with the section's substance.
8. Do NOT write an executive summary, vision statement, or project overview unless the
   section description explicitly asks for one; those belong to their own sections
9. Write only application prose in the applicant's voice. Never address the applicant with
   guidance, caveats, or TODOs (e.g. "applicants are advised to…", "insert the FEMA
   declaration number here"). If a required fact is genuinely absent from project_basics,
   questionnaire_responses, or grant_knowledge_base, write [BRACKETED PLACEHOLDER] so the
   gap is visible rather than inventing a specific figure, date, or declaration number
10. If the section description marks it conditional ("if applicable") and the questionnaire
   responses indicate it does not apply, return a single sentence saying so — do not
   fabricate a narrative to fill it

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
    maxTokens,
  });

  const content = result.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error(
      `Model returned empty content for "${sectionName}" — refusing to save a blank section`
    );
  }
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

  if (parsed.stop_reason === 'max_tokens') {
    throw new Error(
      `Model output hit the ${maxTokens}-token ceiling for ${toolName} ` +
        `(output_tokens=${parsed.usage?.output_tokens}); tool input was discarded as truncated`
    );
  }
  if (!toolBlock?.input || Object.keys(toolBlock.input).length === 0) {
    throw new Error(
      `Model did not return structured tool output for ${toolName} ` +
        `(stop_reason=${parsed.stop_reason})`
    );
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
