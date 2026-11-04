/**
 * What the search index holds for a grant: its searchable text, the texts it embeds, and the
 * Haiku-written use-case profile. Shared by the builder and the recall eval.
 */

import { createHash } from "node:crypto";
import { US_STATES } from "./search-core.mjs";

export const PROFILE_PROMPT_VERSION = 1;
// Titan Text Embeddings v2 takes 8,192 tokens (50,000 characters); a grant's text stays well under.
const EMBED_TEXT_CHARS = 12_000;
const BODY_TEXT_CHARS = 10_000;
const PROFILE_SOURCE_CHARS = 14_000;
const RAW_PROFILE_CHARS = 6_000;

export const DEFAULT_TEXT_OPTIONS = {
  views: ["card", "detail"],
  profileInEmbedding: true,
  profileInBm25: true,
  rawTextChars: 0,
};

export const sha256 = (value) =>
  createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const items = (list) =>
  Array.isArray(list)
    ? list
        .map((entry) => [entry?.item, entry?.description].map((s) => String(s ?? "").trim()).filter(Boolean).join(": "))
        .filter(Boolean)
    : [];

const stateName = (meta) => (meta?.scope === "state" && meta.state ? US_STATES[meta.state] ?? meta.state : "");

/** The summary content that describes the grant; status, pin and deadline edits don't change it. */
export function summaryContent(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  return {
    eligibility: items(s.EligibilityCriteria),
    narrative: items(s.ProjectNarrativeSections),
    documents: items(s.RequiredDocuments).map((d) => d.split(":")[0]),
    keyInfo: items(s.KeyDeadlines),
    stateGuidance: typeof s.stateGuidance === "string" ? s.stateGuidance : "",
  };
}

export function summaryHash(summary, rawText = "") {
  return sha256({ v: PROFILE_PROMPT_VERSION, content: summaryContent(summary), raw: rawText.slice(0, RAW_PROFILE_CHARS) });
}

export function grantFacts(name, meta, summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  return {
    name,
    agency: String(meta?.agency || s.Agency || "").trim(),
    category: String(meta?.category || s.Category || s.category || "").trim(),
    grantType: String(meta?.grant_type || s.grant_type || "").trim(),
    state: stateName(meta),
  };
}

/** The BM25 fields and the embedding views for one grant. */
export function grantTexts(name, meta, summary, { profile = "", rawText = "", options = DEFAULT_TEXT_OPTIONS } = {}) {
  const facts = grantFacts(name, meta, summary);
  const content = summaryContent(summary);
  const raw = options.rawTextChars > 0 ? rawText.slice(0, options.rawTextChars) : "";
  const heading = [
    facts.name,
    facts.agency && `Agency: ${facts.agency}`,
    facts.category && `Category: ${facts.category}`,
    facts.state && `State: ${facts.state}`,
  ].filter(Boolean).join("\n");
  const eligibility = content.eligibility.length ? `Eligibility:\n${content.eligibility.join("\n")}` : "";
  const narrative = content.narrative.length ? `Application sections:\n${content.narrative.join("\n")}` : "";
  const keyInfo = content.keyInfo.length ? `Key information:\n${content.keyInfo.join("\n")}` : "";
  const profileText = profile ? `Use-case profile:\n${profile}` : "";

  const body = [
    facts.state,
    options.profileInBm25 ? profile : "",
    content.eligibility.join("\n"),
    content.narrative.join("\n"),
    content.keyInfo.join("\n"),
    content.stateGuidance,
    raw,
  ].filter(Boolean).join("\n").slice(0, BODY_TEXT_CHARS);

  const withProfile = options.profileInEmbedding ? profileText : "";
  const viewTexts = {
    card: [heading, withProfile, eligibility, raw].filter(Boolean).join("\n\n"),
    detail: [heading, narrative, keyInfo, content.stateGuidance].filter(Boolean).join("\n\n"),
    all: [heading, withProfile, eligibility, narrative, keyInfo, raw].filter(Boolean).join("\n\n"),
    profile: [heading, profileText].filter(Boolean).join("\n\n"),
  };
  const views = options.views
    .map((view) => ({ view, text: (viewTexts[view] ?? "").slice(0, EMBED_TEXT_CHARS) }))
    .filter((v, i) => i === 0 || v.text.length > heading.length + 2);

  return {
    facts,
    fields: { name: facts.name, agency: facts.agency, category: [facts.category, facts.grantType].filter(Boolean).join(" "), body },
    views,
  };
}

export const PROFILE_SYSTEM = [
  "You write short use-case profiles of grant programs for a grant search index.",
  "A profile helps match the grant to someone describing their need in plain words.",
  "Use only what the grant information says. If it doesn't say, leave it out; never guess eligibility.",
].join(" ");

export function profilePrompt(name, meta, summary, rawText = "") {
  const facts = grantFacts(name, meta, summary);
  const content = summaryContent(summary);
  const source = [
    `Grant: ${facts.name}`,
    facts.agency && `Agency: ${facts.agency}`,
    facts.category && `Category: ${facts.category}`,
    facts.state && `State: ${facts.state}`,
    content.eligibility.length && `Eligibility:\n${content.eligibility.join("\n")}`,
    content.narrative.length && `Application sections:\n${content.narrative.join("\n")}`,
    content.keyInfo.length && `Key information:\n${content.keyInfo.join("\n")}`,
    rawText && `Start of the notice:\n${rawText.slice(0, RAW_PROFILE_CHARS)}`,
  ].filter(Boolean).join("\n\n").slice(0, PROFILE_SOURCE_CHARS);
  return `<grant>\n${source}\n</grant>

Write the use-case profile in plain language, at most 140 words, with exactly these four labelled lines:
Who can apply: applicant types and places (states, regions, tribal lands) that are eligible.
Pays for: what the money can be spent on.
Example projects: 3 to 5 short examples separated by semicolons, like "a rural transit district replacing diesel buses".
Typical applicants: the kinds of organizations that usually apply.
Output only the four lines.`;
}
