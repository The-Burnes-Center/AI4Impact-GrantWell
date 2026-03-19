import { VALIDATION_PROMPT } from "./prompts.mjs";
import { updateProcessingStatus } from "../shared/status.mjs";
import { readS3Text } from "../shared/s3.mjs";
import { invokeStructuredOutput } from "../shared/bedrock.mjs";
import { validateValidationResult } from "../shared/json.mjs";
import { VALIDATION_SCHEMA } from "../shared/schemas.mjs";

const SONNET_MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const MAX_SOURCE_CHARS = 100000;

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

  const summaryJson = JSON.stringify(summaryForValidation, null, 2);

  // Guard total prompt size to stay within model context limits (~200K chars)
  const MAX_PROMPT_CHARS = 180000;
  const overhead = VALIDATION_PROMPT.length + summaryJson.length + 100; // tags + newlines
  let finalSource = sourceSample;
  if (overhead + finalSource.length > MAX_PROMPT_CHARS) {
    const allowedSource = MAX_PROMPT_CHARS - overhead;
    finalSource = finalSource.substring(0, allowedSource) + "\n\n[Document truncated to fit context...]";
    console.warn(`Validation prompt truncated source to ${allowedSource} chars for ${nofoName}`);
  }

  const prompt = `${VALIDATION_PROMPT}\n\n<original_nofo>\n${finalSource}\n</original_nofo>\n\n<extracted_summary>\n${summaryJson}\n</extracted_summary>`;

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
  const infoCount = validationResult.issues?.filter(
    (i) => i.severity === "info"
  ).length || 0;

  if (criticalCount > 0 && validationResult.overallVerdict === "PASS") {
    validationResult.overallVerdict = "FAIL";
  }

  // --- Auto-reject fundamentally incomplete documents ---
  // If the extraction has NO eligibility criteria AND NO project narrative sections,
  // the uploaded document is likely wrong, corrupted, or not a real NOFO.
  const hasEligibility = mergedSummary.EligibilityCriteria?.length > 0;
  const hasNarrative = mergedSummary.ProjectNarrativeSections?.length > 0;
  const hasDeadlines = mergedSummary.KeyDeadlines?.length > 0;
  const hasDocuments = mergedSummary.RequiredDocuments?.length > 0;

  const emptyCategories = [
    !hasEligibility && "EligibilityCriteria",
    !hasNarrative && "ProjectNarrativeSections",
    !hasDeadlines && "KeyDeadlines",
    !hasDocuments && "RequiredDocuments",
  ].filter(Boolean);

  let adminGuidance = null;

  if (!hasEligibility && !hasNarrative) {
    // Document is fundamentally incomplete — auto-reject
    validationResult.overallVerdict = "FAIL";
    validationResult.qualityScore = Math.min(validationResult.qualityScore, 20);
    adminGuidance = buildAdminGuidance("incomplete_document", {
      emptyCategories,
      nofoName,
    });
  } else if (emptyCategories.length >= 3) {
    // 3 out of 4 categories empty — almost certainly a bad document
    validationResult.overallVerdict = "FAIL";
    validationResult.qualityScore = Math.min(validationResult.qualityScore, 30);
    adminGuidance = buildAdminGuidance("mostly_empty", {
      emptyCategories,
      nofoName,
    });
  } else if (emptyCategories.length > 0) {
    // Some categories missing — may be a partial NOFO or unusual format
    if (validationResult.overallVerdict === "PASS") {
      validationResult.overallVerdict = "NEEDS_REVIEW";
    }
    adminGuidance = buildAdminGuidance("partial_extraction", {
      emptyCategories,
      nofoName,
    });
  }

  // --- Auto-approve low-risk NEEDS_REVIEW ---
  // If NEEDS_REVIEW only has info-level issues, score >= 70, and no empty categories,
  // auto-approve instead of making admin review it manually.
  if (
    validationResult.overallVerdict === "NEEDS_REVIEW" &&
    criticalCount === 0 &&
    warningCount === 0 &&
    emptyCategories.length === 0 &&
    validationResult.qualityScore >= 70
  ) {
    validationResult.overallVerdict = "PASS";
    console.log(
      `Auto-promoted NEEDS_REVIEW to PASS for ${nofoName}: ` +
      `score=${validationResult.qualityScore}, only ${infoCount} info-level issues`
    );
  }

  // Only override LLM verdict to PASS if score is very high and no issues at all
  if (
    validationResult.qualityScore >= 90 &&
    criticalCount === 0 &&
    warningCount === 0 &&
    emptyCategories.length === 0 &&
    validationResult.overallVerdict !== "PASS"
  ) {
    validationResult.overallVerdict = "PASS";
  }

  console.log(
    `Validation for ${nofoName}: verdict=${validationResult.overallVerdict}, ` +
    `score=${validationResult.qualityScore}, critical=${criticalCount}, warnings=${warningCount}, ` +
    `emptyCategories=${emptyCategories.length}, retryCount=${retryCount}`
  );

  return {
    ...event,
    validationResult,
    adminGuidance,
    retryCount,
  };
};

/**
 * Build actionable admin guidance for quarantined NOFOs.
 * This tells the admin exactly what went wrong and what they should do.
 */
function buildAdminGuidance(reason, context) {
  const { emptyCategories, nofoName } = context;
  const missingList = emptyCategories.join(", ");

  const guidance = {
    reason,
    severity: reason === "partial_extraction" ? "warning" : "critical",
    missingCategories: emptyCategories,
  };

  switch (reason) {
    case "incomplete_document":
      guidance.title = "Document appears to be invalid or not a NOFO";
      guidance.message =
        `The uploaded document for "${nofoName}" produced no Eligibility Criteria and no Project Narrative Sections. ` +
        `This typically means the file is not a valid NOFO, is corrupted, or is a different type of document (e.g., a cover letter, amendment, or appendix).`;
      guidance.actions = [
        "Verify the correct file was uploaded — this should be the full NOFO document, not an amendment or appendix.",
        "Check if the PDF is readable (not scanned images without OCR, not password-protected).",
        "If the document is a valid NOFO, try re-uploading it. If it was a TXT file, ensure the encoding is UTF-8.",
        "If this is an amendment or supplement, upload the full original NOFO instead.",
      ];
      break;

    case "mostly_empty":
      guidance.title = "Document extraction found almost no content";
      guidance.message =
        `The extraction for "${nofoName}" found content in only 1 of 4 categories. ` +
        `Missing: ${missingList}. The document may be incomplete, a partial draft, or in an unusual format.`;
      guidance.actions = [
        "Check if this is the complete NOFO or just a section/chapter of a larger document.",
        "Verify the PDF is not corrupted — try opening it manually to confirm all pages are present.",
        "If the NOFO is a multi-part document, upload the main part that contains eligibility and narrative requirements.",
        "Reject this entry and re-upload the correct complete document.",
      ];
      break;

    case "partial_extraction":
      guidance.title = "Some NOFO sections could not be extracted";
      guidance.message =
        `The extraction for "${nofoName}" is missing: ${missingList}. ` +
        `The document may have an unusual format, or these sections may genuinely not exist in this NOFO.`;
      guidance.actions = [
        `Review the original document to confirm whether ${missingList} are actually present.`,
        "If the missing sections exist in the document, approve with corrections to add them manually.",
        "If the NOFO genuinely doesn't have these sections (e.g., no eligibility restrictions), approve as-is.",
        "If the document is incomplete, reject and re-upload the full version.",
      ];
      break;

    default:
      guidance.title = "Review required";
      guidance.message = `The NOFO "${nofoName}" needs manual review.`;
      guidance.actions = ["Review the extracted summary and validation issues, then approve or reject."];
  }

  return guidance;
}

