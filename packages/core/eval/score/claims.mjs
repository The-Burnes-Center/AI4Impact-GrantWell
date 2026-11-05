import { judgeGrantText } from "../lib/golden.mjs";

const CATEGORIES = ["EligibilityCriteria", "RequiredDocuments", "ProjectNarrativeSections", "KeyDeadlines"];

/** Unsupported claims in one chat answer, judged against the whole grant. */
export async function chatClaims(grant, question, answer, judge) {
  if (!answer) return { counts: { "chat.unsupportedClaims": [0, 0] }, unsupported: [] };
  const grantText = judgeGrantText(grant);
  const claims = await judge.claims({ grantText, question, answer });
  const unsupported = claims.filter((c) => !c.supported);
  return { counts: { "chat.unsupportedClaims": [unsupported.length, claims.length] }, unsupported };
}

/**
 * Unsupported items on the Requirements page as it would be published. A grant the check holds for
 * review shows nothing, so it counts as held, not against the gate.
 */
export async function summaryClaims(grant, output, judge) {
  if (output?.verifyFailing?.length) {
    return { counts: { "summary.heldGrants": [1, 1], "summary.unsupportedItems": [0, 0] }, unsupported: [], held: output.verifyFailing };
  }
  const summary = output?.summary ?? {};
  const items = CATEGORIES.flatMap((c) => (Array.isArray(summary[c]) ? summary[c] : []).map((e) => `${e.item}: ${e.description}`));
  if (output?.applicationDeadline) items.push(`Application deadline: ${output.applicationDeadline}`);
  const verdicts = await judge.items({ grantText: judgeGrantText(grant), items });
  const unsupported = verdicts.filter((v) => !v.supported).map((v) => ({ item: items[v.id], reason: v.reason }));
  return { counts: { "summary.heldGrants": [0, 1], "summary.unsupportedItems": [unsupported.length, items.length] }, unsupported };
}
