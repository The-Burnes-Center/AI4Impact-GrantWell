import { updateProcessingStatus } from "../shared/status.mjs";
import { hasMeaningfulContent, SUMMARY_ARRAY_FIELDS } from "../shared/json.mjs";

export const handler = async (event) => {
  const { nofoName, mergedSummary } = event;

  await updateProcessingStatus(nofoName, "validating");

  const missingSections = SUMMARY_ARRAY_FIELDS.filter(
    (field) => !hasMeaningfulContent(mergedSummary[field])
  );

  let validationResult;
  let adminGuidance = null;

  if (missingSections.length === 0) {
    validationResult = { overallVerdict: "PASS" };
    console.log(`Content check PASS for ${nofoName}: all 4 sections present`);
  } else {
    validationResult = { overallVerdict: "NEEDS_REVIEW" };

    let reason;
    if (missingSections.length === 4) {
      reason = "incomplete_document";
    } else if (missingSections.length >= 3) {
      reason = "mostly_empty";
    } else {
      reason = "partial_extraction";
    }

    adminGuidance = buildAdminGuidance(reason, {
      emptyCategories: missingSections,
      nofoName,
    });

    console.log(
      `Content check NEEDS_REVIEW for ${nofoName}: missing ${missingSections.join(", ")}`
    );
  }

  return {
    ...event,
    validationResult,
    adminGuidance,
    retryCount: 0,
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
    canApprove: reason === "partial_extraction",
  };

  switch (reason) {
    case "incomplete_document":
      guidance.title = "Document appears to be invalid or not a NOFO";
      guidance.message =
        `The uploaded document for "${nofoName}" produced no meaningful content in any of the four extraction categories. ` +
        `This typically means the file is not a valid NOFO, is corrupted, or is a different type of document (e.g., a cover letter, amendment, or appendix). ` +
        `Please reject this entry and upload the correct NOFO document below.`;
      guidance.actions = [
        "Verify the correct file was uploaded — this should be the full NOFO document, not an amendment or appendix.",
        "Check if the PDF is readable (not scanned images without OCR, not password-protected).",
        "Use the 'Re-upload Correct NOFO' button below to upload the correct document without leaving this page.",
        "If this is an amendment or supplement, upload the full original NOFO instead.",
      ];
      break;

    case "mostly_empty":
      guidance.title = "Document extraction found almost no content";
      guidance.message =
        `The extraction for "${nofoName}" found content in only ${4 - emptyCategories.length} of 4 categories. ` +
        `Missing: ${missingList}. The document may be incomplete, a partial draft, or in an unusual format. ` +
        `Please reject this entry and upload the correct complete document below.`;
      guidance.actions = [
        "Check if this is the complete NOFO or just a section/chapter of a larger document.",
        "Verify the PDF is not corrupted — try opening it manually to confirm all pages are present.",
        "Use the 'Re-upload Correct NOFO' button below to upload the correct document without leaving this page.",
        "If the NOFO is a multi-part document, upload the main part that contains eligibility and narrative requirements.",
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
      guidance.actions = ["Review the extracted summary, then approve or reject."];
  }

  return guidance;
}
