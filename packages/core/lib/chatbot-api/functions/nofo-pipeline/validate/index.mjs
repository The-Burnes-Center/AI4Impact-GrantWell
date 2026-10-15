import { updateProcessingStatus } from "../shared/status.mjs";
import { hasMeaningfulContent, SUMMARY_ARRAY_FIELDS } from "../shared/json.mjs";
import { hasQuestions } from "../shared/questions.mjs";

export const handler = async (event) => {
  const { nofoName, mergedSummary, questionsData, failedChunks } = event;

  await updateProcessingStatus(nofoName, "validating");

  const missingParts = describeMissingParts(failedChunks);

  const missingSections = SUMMARY_ARRAY_FIELDS.filter(
    (field) => !hasMeaningfulContent(mergedSummary[field])
  );

  let reason = null;
  if (missingSections.length === 4) {
    reason = "incomplete_document";
  } else if (missingSections.length >= 3) {
    reason = "mostly_empty";
  } else if (!hasQuestions(questionsData)) {
    reason = "no_questions";
  } else if (missingSections.length > 0) {
    reason = "partial_extraction";
  } else if (missingParts) {
    reason = "partial_document";
  }

  const adminGuidance = reason
    ? buildAdminGuidance(reason, { emptyCategories: missingSections, nofoName, missingParts })
    : null;

  // partial_extraction (1-2 missing) is approvable, so auto-publish it and let the guidance ride along
  // as an advisory review flag. Anything else, including an unread part of the text, blocks on review.
  let validationResult;
  if (!reason || (reason === "partial_extraction" && !missingParts)) {
    validationResult = { overallVerdict: "PASS" };
    console.log(
      reason
        ? `Content check PASS (flagged) for ${nofoName}: missing ${missingSections.join(", ")}`
        : `Content check PASS for ${nofoName}: all 4 sections present`
    );
  } else {
    validationResult = { overallVerdict: "NEEDS_REVIEW" };
    console.log(
      reason === "no_questions"
        ? `Content check NEEDS_REVIEW for ${nofoName}: no application questions generated`
        : reason === "partial_document"
          ? `Content check NEEDS_REVIEW for ${nofoName}: part of the text unread`
          : `Content check NEEDS_REVIEW for ${nofoName}: missing ${missingSections.join(", ")}`
    );
  }

  return {
    ...event,
    validationResult,
    adminGuidance,
    retryCount: 0,
  };
};

/** One sentence naming the parts of the grant text the extraction step could not read, or null. */
function describeMissingParts(failedChunks) {
  if (!Array.isArray(failedChunks) || failedChunks.length === 0) return null;
  const parts = failedChunks.map(
    (c) => `part ${c.part} of ${c.of} (about ${c.startPercent}%–${c.endPercent}% of the way through)`
  );
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `The grant text could not be read in ${list}, so requirements from there may be missing.`;
}

/**
 * Build actionable admin guidance for quarantined NOFOs.
 * This tells the admin exactly what went wrong and what they should do.
 */
function buildAdminGuidance(reason, context) {
  const { emptyCategories, nofoName, missingParts } = context;
  const missingList = emptyCategories.join(", ");

  const guidance = {
    reason,
    severity: reason === "partial_extraction" || reason === "partial_document" ? "warning" : "critical",
    missingCategories: emptyCategories,
    canApprove: reason === "partial_extraction" || reason === "partial_document" || reason === "no_questions",
  };

  switch (reason) {
    case "incomplete_document":
      guidance.title = "Document appears to be invalid or not a grant document";
      guidance.message =
        `The uploaded document for "${nofoName}" produced no meaningful content in any of the four extraction categories. ` +
        `This typically means the file is not a valid grant document, is corrupted, or is a different type of document (e.g., a cover letter, amendment, or appendix). ` +
        `Please reject this entry and upload the correct grant document below.`;
      guidance.actions = [
        "Verify the correct file was uploaded — this should be the full grant document, not an amendment or appendix.",
        "Check if the PDF is readable (not scanned images without OCR, not password-protected).",
        "Use the 'Re-upload Grant Document' button below to upload the correct document without leaving this page.",
        "If this is an amendment or supplement, upload the full original grant document instead.",
      ];
      break;

    case "mostly_empty":
      guidance.title = "Document extraction found almost no content";
      guidance.message =
        `The extraction for "${nofoName}" found content in only ${4 - emptyCategories.length} of 4 categories. ` +
        `Missing: ${missingList}. The document may be incomplete, a partial draft, or in an unusual format. ` +
        `Please reject this entry and upload the correct complete document below.`;
      guidance.actions = [
        "Check if this is the complete grant document or just a section/chapter of a larger document.",
        "Verify the PDF is not corrupted — try opening it manually to confirm all pages are present.",
        "Use the 'Re-upload Grant Document' button below to upload the correct document without leaving this page.",
        "If the grant document has multiple parts, upload the main part that contains eligibility and narrative requirements.",
      ];
      break;

    case "partial_extraction":
      guidance.title = "Some grant sections could not be extracted";
      guidance.message =
        `The extraction for "${nofoName}" is missing: ${missingList}. ` +
        `The document may have an unusual format, or these sections may genuinely not exist in this grant.`;
      guidance.actions = [
        `Review the original document to confirm whether ${missingList} are actually present.`,
        "If the missing sections exist in the document, approve with corrections to add them manually.",
        "If the grant genuinely doesn't have these sections (e.g., no eligibility restrictions), approve as-is.",
        "If the document is incomplete, reject and re-upload the full version.",
      ];
      break;

    case "no_questions":
      guidance.title = "No application questions generated";
      guidance.message =
        `The question generation step for "${nofoName}" failed twice and produced no application questions. ` +
        `Publishing it as-is would leave applicants with an empty questionnaire, so it was held for review. ` +
        `This is usually a temporary model error.` +
        (emptyCategories.length > 0 ? ` The extraction is also missing: ${missingList}.` : "");
      guidance.actions = [
        "Click Reprocess to run the grant through the pipeline again. This fixes most cases.",
        "Or approve: questions are regenerated from the extracted requirements (with your corrections) before publishing.",
        "If approving keeps failing, reprocess later or check the extracted requirements for problems.",
      ];
      break;

    case "partial_document":
      guidance.title = "Part of the grant could not be read";
      guidance.message = `The rest of "${nofoName}" was extracted and published.`;
      guidance.actions = [
        "Compare that part of the original document with the extracted requirements and add anything missing.",
      ];
      break;

    default:
      guidance.title = "Review required";
      guidance.message = `The grant "${nofoName}" needs manual review.`;
      guidance.actions = ["Review the extracted requirements, then approve or reject."];
  }

  if (missingParts) {
    guidance.missingParts = missingParts;
    guidance.message = `${missingParts} ${guidance.message}`;
  }

  return guidance;
}
