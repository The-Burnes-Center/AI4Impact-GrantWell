import { VALIDATION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeBedrockWithRetry } from "../shared/bedrock.mjs";
import { extractJson, validateValidationResult } from "../shared/json.mjs";

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

  const summaryForValidation = { ...mergedSummary };
  delete summaryForValidation._processingMeta;

  const prompt = `${VALIDATION_PROMPT}\n\n<original_nofo>\n${sourceSample}\n</original_nofo>\n\n<extracted_summary>\n${JSON.stringify(summaryForValidation, null, 2)}\n</extracted_summary>`;

  const response = await invokeBedrockWithRetry({
    modelId: SONNET_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
      temperature: 0,
    }),
  });

  const body = JSON.parse(new TextDecoder().decode(response.body));
  const parsed = extractJson(body.content[0].text);
  const validation = validateValidationResult(parsed);

  let validationResult;
  if (validation.data) {
    if (validation.errors.length > 0) {
      console.warn(`Validation result schema issues for ${nofoName}:`, validation.errors);
    }
    validationResult = validation.data;
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

