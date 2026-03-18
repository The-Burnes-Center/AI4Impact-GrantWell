import { VALIDATION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeStructuredOutput } from "../shared/bedrock.mjs";
import { validateValidationResult } from "../shared/json.mjs";
import { VALIDATION_SCHEMA } from "../shared/schemas.mjs";

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

  let validationResult;
  try {
    const parsed = await invokeStructuredOutput({
      modelId: SONNET_MODEL,
      prompt,
      schema: VALIDATION_SCHEMA,
      toolName: "save_validation_result",
      toolDescription: "Save the validation result for the NOFO extraction",
      maxTokens: 3000,
    });

    const validation = validateValidationResult(parsed);

    if (validation.data) {
      if (validation.errors.length > 0) {
        console.warn(`Validation result schema issues for ${nofoName}:`, validation.errors);
      }
      validationResult = validation.data;
    } else {
      throw new Error(`Post-validation failed: ${validation.errors.join(", ")}`);
    }
  } catch (error) {
    console.error(`Validation structured output failed for ${nofoName}:`, error.message);
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

