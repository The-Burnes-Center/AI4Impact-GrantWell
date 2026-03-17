import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { VALIDATION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";

const s3Client = new S3Client();
const bedrockClient = new BedrockRuntimeClient();
const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const MAX_SOURCE_CHARS = 60000;

export const handler = async (event) => {
  const { s3Bucket, rawTextKey, nofoName, mergedSummary, qualityScore, retryCount } = event;

  await updateProcessingStatus(nofoName, "validating");

  const rawText = await readS3Text(s3Bucket, rawTextKey);
  const sourceSample =
    rawText.length > MAX_SOURCE_CHARS
      ? rawText.substring(0, MAX_SOURCE_CHARS) + "\n\n[Document truncated...]"
      : rawText;

  // Strip internal processing metadata before sending to validator
  const summaryForValidation = { ...mergedSummary };
  delete summaryForValidation._processingMeta;

  const prompt = `${VALIDATION_PROMPT}\n\n<original_nofo>\n${sourceSample}\n</original_nofo>\n\n<extracted_summary>\n${JSON.stringify(summaryForValidation, null, 2)}\n</extracted_summary>`;

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: SONNET_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3000,
        temperature: 0,
      }),
    })
  );

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const responseText = body.content[0].text;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);

  let validationResult;
  if (jsonMatch) {
    validationResult = JSON.parse(jsonMatch[0]);
  } else {
    validationResult = {
      overallVerdict: "NEEDS_REVIEW",
      qualityScore: qualityScore || 50,
      issues: [
        {
          severity: "warning",
          category: "incomplete",
          field: "validation",
          description: "Validator could not produce structured output.",
          suggestedFix: "Manual review recommended.",
        },
      ],
      missingItems: [],
    };
  }

  // Override verdict based on critical issues count
  const criticalCount = validationResult.issues?.filter(
    (i) => i.severity === "critical"
  ).length || 0;
  const warningCount = validationResult.issues?.filter(
    (i) => i.severity === "warning"
  ).length || 0;

  if (criticalCount > 0 && validationResult.overallVerdict === "PASS") {
    validationResult.overallVerdict = "FAIL";
  }

  if (
    validationResult.qualityScore >= 80 &&
    criticalCount === 0 &&
    validationResult.overallVerdict !== "PASS"
  ) {
    validationResult.overallVerdict = "PASS";
  }

  console.log(
    `Validation for ${nofoName}: verdict=${validationResult.overallVerdict}, ` +
    `score=${validationResult.qualityScore}, critical=${criticalCount}, warnings=${warningCount}, ` +
    `retryCount=${retryCount}`
  );

  return {
    ...event,
    validationResult,
    retryCount,
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
