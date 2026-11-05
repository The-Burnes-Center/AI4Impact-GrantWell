/** Admin guidance for a grant whose Requirements page items could not be matched to the grant. */

export const CATEGORY_LABELS = {
  EligibilityCriteria: "Eligibility Criteria",
  RequiredDocuments: "Required Documents",
  ProjectNarrativeSections: "Project Narrative Sections",
  KeyDeadlines: "Key Deadlines",
  application_deadline: "Application deadline",
  grant_text: "Grant text",
};

const labelOf = (category) => CATEGORY_LABELS[category] ?? category;

const HIDDEN_NOTE = "Users won't see this grant until you fix or approve it.";
const LIVE_NOTE = "Users keep seeing the published version until you approve or reject this new one.";

/**
 * The guidance for a live grant's failing new version, whose published version stays up.
 * `liveStatus` is the status it stays under: an archived grant "was published", not "is live".
 */
export function keptLiveGuidance(guidance, nofoName, liveStatus) {
  if (typeof guidance?.message !== "string") return guidance;
  const lead = `"${nofoName}" ${liveStatus === "archived" ? "was published" : "is live"}.`;
  const body = guidance.message.includes(HIDDEN_NOTE)
    ? guidance.message.replace(HIDDEN_NOTE, LIVE_NOTE)
    : `${guidance.message.trimEnd()} ${LIVE_NOTE}`.trim();
  return { ...guidance, message: `${lead} ${body}` };
}

const failingItemsOf = (failingItems) =>
  failingItems.map((f) => ({ category: f.category, label: labelOf(f.category), item: f.item, reason: f.reason }));

/** `live` is the status ("active" or "archived") of a published grant being unpublished, else false. */
const unpublishedNote = (nofoName, live) =>
  live ? `"${nofoName}" ${live === "archived" ? "was published" : "was live"} and has been unpublished until it is reviewed. ` : "";

function unreadableTextGuidance(nofoName, failingItems, live) {
  const why = failingItems.map((f) => f.reason).filter(Boolean).join(" ");
  return {
    reason: "unverified_items",
    severity: "critical",
    missingCategories: [],
    canApprove: true,
    title: "The grant's text couldn't be read",
    message:
      unpublishedNote(nofoName, live) +
      `GrantWell couldn't read this grant's text, so none of the requirements on its Requirements page could be checked against the grant.` +
      (why ? ` ${why}` : "") +
      ` ${HIDDEN_NOTE}`,
    actions: [
      "Open the grant document and check that its text can be read. If it can't, re-upload a readable copy.",
      "Check each item on the Requirements page against the grant document yourself.",
      "Approve when every item matches the grant. Approving publishes the grant.",
    ],
    failingItems: failingItemsOf(failingItems),
  };
}

export function unverifiedItemsGuidance(nofoName, failingItems, { live = false } = {}) {
  if (failingItems.length && failingItems.every((f) => f.category === "grant_text")) {
    return unreadableTextGuidance(nofoName, failingItems, live);
  }
  const named = failingItems.map((f) => `${labelOf(f.category)}: "${f.item}"`);
  const count = failingItems.length === 1 ? "1 item" : `${failingItems.length} items`;
  return {
    reason: "unverified_items",
    severity: "critical",
    missingCategories: [],
    canApprove: true,
    title: "Some requirements could not be confirmed in the grant",
    message:
      unpublishedNote(nofoName, live) +
      `${count} on the Requirements page could not be matched to what the grant says` +
      (live ? "" : ", even after one automatic rewrite") +
      `: ${named.join("; ")}. ${HIDDEN_NOTE}`,
    actions: [
      "Check each item listed below against the grant document.",
      "Correct any item the grant does not support so it says only what the grant states, or remove it.",
      "Approve when every item matches the grant. Approving publishes the grant.",
    ],
    failingItems: failingItemsOf(failingItems),
  };
}
