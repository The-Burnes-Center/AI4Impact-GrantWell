import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { SECTION_DETECTION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";

const s3Client = new S3Client();
const bedrockClient = new BedrockRuntimeClient();
const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const MAX_INPUT_CHARS = 80000;

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName } = event;

  await updateProcessingStatus(nofoName, "detecting_sections");

  const rawText = await readS3Text(s3Bucket, rawTextKey);

  const textSample =
    rawText.length > MAX_INPUT_CHARS
      ? rawText.substring(0, MAX_INPUT_CHARS) +
        "\n\n[Document truncated for section detection...]"
      : rawText;

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: SONNET_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [
          {
            role: "user",
            content: `${SECTION_DETECTION_PROMPT}\n\n<document>\n${textSample}\n</document>`,
          },
        ],
        max_tokens: 4000,
        temperature: 0,
      }),
    })
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const text = body.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  let sections;
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    sections = parsed.sections || [parsed];
  } else {
    sections = [
      {
        title: "Full Document",
        startOffset: 0,
        endOffset: rawText.length,
        category: "general",
      },
    ];
  }

  // Ensure endOffset does not exceed document length
  sections = sections.map((s) => ({
    ...s,
    endOffset: Math.min(s.endOffset, rawText.length),
  }));

  // Build section items with text for downstream processing
  // Cap each section at 50K chars to stay within Bedrock limits
  const MAX_SECTION_CHARS = 50000;
  const sectionItems = [];

  for (const section of sections) {
    const sectionText = rawText.substring(section.startOffset, section.endOffset);
    if (sectionText.trim().length === 0) continue;

    if (sectionText.length > MAX_SECTION_CHARS) {
      let offset = 0;
      let partIndex = 0;
      while (offset < sectionText.length) {
        sectionItems.push({
          title: `${section.title} (Part ${++partIndex})`,
          category: section.category,
          text: sectionText.substring(offset, offset + MAX_SECTION_CHARS),
          nofoName,
          s3Bucket,
        });
        offset += MAX_SECTION_CHARS;
      }
    } else {
      sectionItems.push({
        title: section.title,
        category: section.category,
        text: sectionText,
        nofoName,
        s3Bucket,
      });
    }
  }

  console.log(`Detected ${sectionItems.length} section(s) for ${nofoName}`);

  return {
    ...event,
    sections: sectionItems,
  };
};

async function readS3Text(bucket, key) {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
