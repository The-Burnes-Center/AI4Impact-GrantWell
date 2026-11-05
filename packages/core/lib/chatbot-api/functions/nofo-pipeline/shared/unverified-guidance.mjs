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

const failingItemsOf = (failingItems) =>
  failingItems.map((f) => ({ category: f.category, label: labelOf(f.category), item: f.item, reason: f.reason }));

function unreadableTextGuidance(nofoName, failingItems, live) {
  const why = failingItems.map((f) => f.reason).filter(Boolean).join(" ");
  return {
    reason: "unverified_items",
    severity: "critical",
    missingCategories: [],
    canApprove: true,
    title: "The grant's text couldn't be read",
    message:
      (live ? `"${nofoName}" was live and has been unpublished until it is reviewed. ` : "") +
      `GrantWell couldn't read this grant's text, so none of the requirements on its Requirements page could be checked against the grant.` +
      (why ? ` ${why}` : "") +
      " Users won't see this grant until you fix or approve it.",
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
      (live ? `"${nofoName}" was live and has been unpublished until it is reviewed. ` : "") +
      `${count} on the Requirements page could not be matched to what the grant says` +
      (live ? "" : ", even after one automatic rewrite") +
      `: ${named.join("; ")}. Users won't see this grant until you fix or approve it.`,
    actions: [
      "Check each item listed below against the grant document.",
      "Correct any item the grant does not support so it says only what the grant states, or remove it.",
      "Approve when every item matches the grant. Approving publishes the grant.",
    ],
    failingItems: failingItemsOf(failingItems),
  };
}
