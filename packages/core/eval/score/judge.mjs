import { sha } from "../lib/aws.mjs";

const BEDROCK = new URL("../../lib/chatbot-api/functions/nofo-pipeline/shared/bedrock.mjs", import.meta.url);

const squash = (t) => String(t).toLowerCase().replace(/\s+/g, " ").trim();
// A judgement only counts when its evidence is really in the text it claims to quote.
const quoted = (evidence, text) => squash(evidence).length >= 3 && squash(text).includes(squash(evidence));
// Claim and item audits compare words only: a judge's quote often differs from the grant in
// punctuation, quote marks or line breaks, and may join two passages with an ellipsis.
const words = (t) => String(t).toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim();
const quotedWords = (evidence, text) => {
  const hay = words(text);
  const parts = String(evidence).split(/\.{3}|…/).map(words).filter((p) => p.split(" ").length >= 3);
  if (parts.length > 0 && parts.every((p) => hay.includes(p))) return true;
  // Near-exact: a run of 5 words from the quote is in the grant, and 85% of its words sit around it.
  const ev = words(evidence).split(" ").filter(Boolean);
  if (ev.length < 6) return false;
  const span = ev.join(" ").length;
  for (let i = 0; i + 5 <= ev.length; i++) {
    const at = hay.indexOf(ev.slice(i, i + 5).join(" "));
    if (at < 0) continue;
    const near = new Set(hay.slice(Math.max(0, at - span), at + 2 * span).split(" "));
    if (ev.filter((w) => near.has(w)).length / ev.length >= 0.85) return true;
  }
  return false;
};

const list = (items) => items.map((t, i) => `<item id="${i}">${String(t).replace(/<\/?item[^>]*>/g, "")}</item>`).join("\n");

async function ask({ model, prompt, schema, toolName, maxTokens = 4000, effort = "low" }) {
  const { invokeStructuredOutput } = await import(BEDROCK.href);
  return invokeStructuredOutput({ modelId: model, prompt, schema, toolName, toolDescription: `Return the ${toolName} result`, maxTokens, effort });
}

export const PROMPTS = {
  claims: `You audit a grant chatbot's answer for unsupported claims, using the full grant text below as the only source of truth.
List every claim the answer makes about the grant: eligibility, dates and times, amounts, percentages, counts, required documents, rules, contacts, websites, regulations, and what the grant does or doesn't say. Split compound sentences into separate claims. Skip greetings, offers to help, questions back to the user, and advice to confirm with the program officer.
For each claim decide "supported": true only when the grant text states it or it follows directly with nothing added. A claim that the grant doesn't mention something is supported only if the grant really doesn't mention it. A claim that a date the grant states has or hasn't passed is supported when it is right for today's date, given below. For a supported claim, quote "evidence": copy one stretch of at least 6 consecutive words of the grant that states it (the whole line or table row when it is shorter), word for word, exactly as it appears, with no ellipses, no paraphrase and no joining of separate passages (empty for a supported "doesn't mention" claim). Give a short "reason" for any unsupported claim.
List only what the answer says. Never list something the answer leaves out; an incomplete answer is not an unsupported claim.`,
  items: `You audit the requirements a grant pipeline extracted, using the full grant text below as the only source of truth. For each item decide "supported": true only when the grant text states everything the item says (wording may differ; nothing may be added, changed or left out in a way that changes its meaning). Quote "evidence": copy one stretch of at least 6 consecutive words of the grant that states it (the whole line or table row when it is shorter), word for word, exactly as it appears, with no ellipses or paraphrase. Give a short "reason" for any unsupported item.`,
  pair: `You match items a grant-extraction pipeline produced against an answer key written from the same grant notice.
Pair a predicted item with a key item only when the predicted item states the key item's requirement, section or rule (wording may differ, and the predicted item may be merged with neighbours or be more or less detailed). For every pair, quote "evidence": the exact words of the predicted item that state it. A predicted item may pair with several key items when it states each of them; several predicted items may pair with one key item when they repeat it. Items that only share a topic, category or heading are not a pair. Many key items have no pair; never force one.`,
  find: `You check whether a grant-extraction pipeline's output states facts from an answer key. For each key item, decide "found": the output states this item (in any wording, anywhere in the output), with "evidence": the exact words of the output that state it (empty when not found). "valueCorrect": the output gives the item's value as the key does (dates, times, time zones, amounts, points, limits); null when the item has no value to compare. A related but different item is not found.`,
  chat: `You grade a grant chatbot's answer against the expected answer an expert wrote from the grant notice.
"correct": the answer gives the expected facts (dates, times, amounts, rules) without contradicting them; extra correct detail is fine, a wrong or missing key fact is not.
"saysNotStated": the answer says the notice does not say or that the information was not found.
"verdict": for a can-I-use-funds question, the answer's verdict: allowed, not_allowed, conditional, or none if it gives none.`,
  draft: `You review a drafted grant application against the applicant's inputs and the grant's scoring criteria.
List "untracedNumbers": specific figures in the draft (counts, percentages, dollar amounts, dates) that appear neither in the applicant inputs nor in the grant notice excerpts; skip numbers that are plainly the section limits or the award terms.
List "contradictions": pairs of statements in different sections that cannot both be true.
For each scored criterion, "addressed": the draft gives this criterion substantive, specific content (not just a mention).
For each known trap, "handled": the draft avoids the mistake the trap describes.`,
};

const PAIR_SCHEMA = {
  type: "object",
  properties: { pairs: { type: "array", items: { type: "object", properties: { key: { type: "integer" }, predicted: { type: "integer" }, evidence: { type: "string" } }, required: ["key", "predicted", "evidence"] } } },
  required: ["pairs"],
};
const FIND_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, found: { type: "boolean" }, evidence: { type: "string" }, valueCorrect: { anyOf: [{ type: "boolean" }, { type: "null" }] } },
        required: ["id", "found", "evidence", "valueCorrect"],
      },
    },
  },
  required: ["items"],
};
const CHAT_SCHEMA = {
  type: "object",
  properties: {
    correct: { type: "boolean" },
    saysNotStated: { type: "boolean" },
    verdict: { type: "string", enum: ["allowed", "not_allowed", "conditional", "none"] },
    reason: { type: "string" },
  },
  required: ["correct", "saysNotStated", "verdict", "reason"],
};
const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: { claim: { type: "string" }, absence: { type: "boolean" }, supported: { type: "boolean" }, evidence: { type: "string" }, reason: { type: "string" } },
        required: ["claim", "absence", "supported", "evidence", "reason"],
      },
    },
  },
  required: ["claims"],
};

const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, supported: { type: "boolean" }, evidence: { type: "string" }, reason: { type: "string" } },
        required: ["id", "supported", "evidence", "reason"],
      },
    },
  },
  required: ["items"],
};

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    untracedNumbers: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    criteria: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, addressed: { type: "boolean" } }, required: ["id", "addressed"] } },
    traps: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, handled: { type: "boolean" } }, required: ["id", "handled"] } },
  },
  required: ["untracedNumbers", "contradictions", "criteria", "traps"],
};

export function judge(models) {
  return {
    promptHash: sha(PROMPTS),

    async pair(field, keyItems, predictedItems) {
      if (keyItems.length === 0 || predictedItems.length === 0) return [];
      const out = await ask({
        model: models.haiku,
        toolName: "pairs",
        schema: PAIR_SCHEMA,
        prompt: `${PROMPTS.pair}\n\nField: ${field}\n\n<key>\n${list(keyItems)}\n</key>\n\n<predicted>\n${list(predictedItems)}\n</predicted>`,
      });
      return (out.pairs ?? []).filter(
        (p) => p.key >= 0 && p.key < keyItems.length && p.predicted >= 0 && p.predicted < predictedItems.length && quoted(p.evidence, predictedItems[p.predicted])
      );
    },

    async find(field, keyItems, outputText) {
      if (keyItems.length === 0) return [];
      const out = await ask({
        model: models.haiku,
        toolName: "findings",
        schema: FIND_SCHEMA,
        prompt: `${PROMPTS.find}\n\nField: ${field}\n\n<key>\n${list(keyItems)}\n</key>\n\n<output>\n${outputText}\n</output>`,
      });
      const byId = new Map((out.items ?? []).map((r) => [r.id, r]));
      return keyItems.map((_, i) => {
        const r = byId.get(i);
        return r?.found && quoted(r.evidence, outputText) ? r : { id: i, found: false, evidence: "", valueCorrect: false };
      });
    },

    async chat(question, expected, answer) {
      return ask({
        model: models.sonnet,
        toolName: "grade",
        schema: CHAT_SCHEMA,
        effort: "medium",
        prompt: `${PROMPTS.chat}\n\n<question>${question}</question>\n<expected>${expected}</expected>\n<answer>\n${answer ?? "(no answer)"}\n</answer>`,
      });
    },

    // A "supported" verdict counts only when its evidence is really in the grant text.
    async claims({ grantText, question, answer }) {
      const out = await ask({
        model: models.sonnet,
        toolName: "claims",
        schema: CLAIMS_SCHEMA,
        effort: "medium",
        maxTokens: 8000,
        prompt: `${PROMPTS.claims}\n\nToday's date: ${this.today ?? "unknown"}.\n\n<grant_text>\n${grantText}\n</grant_text>\n\n<question>${question}</question>\n<answer>\n${answer}\n</answer>`,
      });
      const dateOnly = (c) => /\b(?:has|have|had|hasn't|has not|is|isn't|already|not yet|still)\b.*\b(?:passed|open|closed|ended|past)\b/i.test(c.claim);
      return (out.claims ?? []).map((c) => {
        const evidenceOk = c.absence || quotedWords(c.evidence, grantText) || (dateOnly(c) && !c.evidence);
        return {
          ...c,
          supported: !!c.supported && evidenceOk,
          reason: c.supported && !evidenceOk ? "evidence not found in the grant" : c.reason,
        };
      });
    },

    async items({ grantText, items }) {
      if (items.length === 0) return [];
      const out = await ask({
        model: models.sonnet,
        toolName: "items",
        schema: ITEMS_SCHEMA,
        effort: "medium",
        maxTokens: 8000,
        prompt: `${PROMPTS.items}\n\n<grant_text>\n${grantText}\n</grant_text>\n\n<items>\n${list(items)}\n</items>`,
      });
      const byId = new Map((out.items ?? []).map((r) => [r.id, r]));
      return items.map((_, i) => {
        const r = byId.get(i);
        const ok = !!r?.supported && quotedWords(r.evidence, grantText);
        return { id: i, supported: ok, reason: ok ? "" : r ? (r.supported ? "evidence not found in the grant" : r.reason) : "no verdict" };
      });
    },

    async draft({ inputs, excerpts, sections, criteria, traps }) {
      return ask({
        model: models.sonnet,
        toolName: "review",
        schema: DRAFT_SCHEMA,
        effort: "medium",
        maxTokens: 8000,
        prompt: `${PROMPTS.draft}\n\n<applicant_inputs>\n${JSON.stringify(inputs, null, 1)}\n</applicant_inputs>\n\n<notice_excerpts>\n${excerpts}\n</notice_excerpts>\n\n<scored_criteria>\n${list(criteria)}\n</scored_criteria>\n\n<known_traps>\n${list(traps)}\n</known_traps>\n\n<draft>\n${sections.map((s) => `## ${s.name}\n${s.content ?? "(empty)"}`).join("\n\n")}\n</draft>`,
      });
    },
  };
}
