import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { EXTRACTION_PROMPTS, RETRY_PROMPT_PREFIX } from "./prompts.mjs";

const bedrockClient = new BedrockRuntimeClient();
const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";

export const handler = async (event) => {
  const { title, category, text, nofoName, validationFeedback } = event;

  const promptTemplate =
    EXTRACTION_PROMPTS[category] || EXTRACTION_PROMPTS.general;

  let prompt = promptTemplate;
  if (validationFeedback) {
    prompt = `${RETRY_PROMPT_PREFIX}${validationFeedback}\n\n${promptTemplate}`;
  }

  const fullPrompt = `${prompt}\n\n<nofo_section title="${title}">\n${text}\n</nofo_section>`;

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: SONNET_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [{ role: "user", content: fullPrompt }],
        max_tokens: 4000,
        temperature: 0,
      }),
    })
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const responseText = body.content[0].text;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    console.warn(`No JSON extracted from section "${title}" of ${nofoName}`);
    return {
      category,
      items: [],
      agentNotes: "Failed to extract structured data from this section.",
      sectionTitle: title,
    };
  }

  const result = JSON.parse(jsonMatch[0]);

  // Add source section reference to each item
  if (result.items) {
    result.items = result.items.map((item) => ({
      ...item,
      sourceSection: title,
    }));
  }

  console.log(
    `Extracted ${result.items?.length || 0} items from "${title}" (${category}) for ${nofoName}`
  );

  return {
    ...result,
    sectionTitle: title,
  };
};
