/**
 * Checks every item on a grant's Requirements page against the grant: dates, amounts and numbers by
 * code (fact-check), meaning by Haiku against the passages each item was cited to. Failing items can
 * be rewritten once by Sonnet from the grant itself; a rewrite is kept only if it passes the same
 * checks. Nothing is ever dropped: an item the rewrite says to remove stays, and stays failing.
 */

import { sourceKeys, unsupportedFacts } from "grantwell-shared";
import { invokeBedrockWithRetry, toStrictSchema } from "./bedrock.mjs";
import { citeItems, citationsFile, quotesOf, requirementItems, MAX_TEXT_CHARS } from "./cite.mjs";

const MEANING_BATCH = 40;
const ITEM_MAX_CHARS = 200;
const REASON_MAX_CHARS = 400;

const MEANING_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          supported: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["id", "supported", "reason"],
      },
    },
  },
  required: ["results"],
};

const clip = (s, n) => {
  const text = String(s ?? "").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;
};
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const listOf = (values) => (values.length === 1 ? values[0] : `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`);

export function meaningPrompt(batch) {
  const blocks = batch
    .map((i) => {
      const passages = i.quotes.map((q) => `<passage${q.page ? ` page="${q.page}"` : ""}>${oneLine(q.quote)}</passage>`).join("\n");
      return `<requirement id="${i.id}">\n<name>${oneLine(i.item)}</name>\n<text>${oneLine(i.description)}</text>\n${passages}\n</requirement>`;
    })
    .join("\n\n");
  return `Each requirement below was written from a grant, and the passages under it are quoted from that grant. For each requirement, decide whether its passages support it. It is supported only if everything it states (who may apply, what is required, amounts, dates, conditions and rules) is stated in its passages or follows directly from them. If it adds, changes or broadens anything, or leaves out a condition that changes its meaning, it is unsupported. Give a short reason either way that names what is missing or wrong. Answer for every ID.

${blocks}`;
}

// Built here rather than with invokeStructuredOutput, which never sends thinking "disabled"
// (Sonnet 5.5 rejects it); Haiku 5.5 accepts it at low effort.
async function judgeMeaning(batch) {
  const maxTokens = Math.min(16000, 1000 + batch.length * 200);
  const response = await invokeBedrockWithRetry({
    modelId: process.env.HAIKU_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: toStrictSchema(MEANING_SCHEMA) } },
      messages: [{ role: "user", content: meaningPrompt(batch) }],
    }),
  });
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  if (parsed.stop_reason === "refusal") throw new Error(`Haiku declined the meaning check (${parsed.stop_details?.category ?? "no category"})`);
  if (parsed.stop_reason === "max_tokens") throw new Error(`Meaning check was cut off at max_tokens=${maxTokens}`);
  const text = parsed.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Meaning check returned no answer");
  return new Map((JSON.parse(text)?.results ?? []).map((r) => [String(r.id), r]));
}

/** Cites, fact-checks and meaning-checks `items`. Returns citations and a verdict per item id. */
export async function checkItems(nofoName, rawText, items, keys) {
  const byId = items.length ? await citeItems(nofoName, rawText, items) : new Map();
  const verdicts = new Map();
  const toJudge = [];
  for (const item of items) {
    const facts = unsupportedFacts(`${item.item}\n${item.description}`, [], keys);
    if (facts.length) {
      verdicts.set(item.id, { ok: false, reason: `The grant doesn't state ${listOf(facts.map((f) => `"${f.raw}"`))}.` });
      continue;
    }
    const quotes = quotesOf(byId.get(item.id));
    if (!quotes.length) {
      verdicts.set(item.id, { ok: false, reason: "No passage in the grant states this." });
      continue;
    }
    toJudge.push({ ...item, quotes });
  }
  const batches = [];
  for (let i = 0; i < toJudge.length; i += MEANING_BATCH) batches.push(toJudge.slice(i, i + MEANING_BATCH));
  const answers = await Promise.all(batches.map(judgeMeaning));
  batches.forEach((batch, b) => {
    for (const item of batch) {
      const answer = answers[b].get(item.id);
      if (!answer) verdicts.set(item.id, { ok: false, reason: "The meaning check gave no answer for this item." });
      else verdicts.set(item.id, { ok: answer.supported === true, reason: oneLine(answer.reason) || (answer.supported ? "" : "Not supported by the passages cited.") });
    }
  });
  return { byId, verdicts };
}

function deadlineProblem(deadline, keys) {
  return unsupportedFacts(String(deadline), [], keys).length ? `The date ${deadline} does not appear in the grant.` : null;
}

export function rewritePrompt(failing, deadline) {
  const list = failing.map((i) => `[${i.id}] ${oneLine(i.item)}: ${oneLine(i.description)}\nReason: ${oneLine(i.reason)}`).join("\n\n");
  const parts = [];
  if (failing.length) {
    parts.push(`The grant above was summarized into requirements. A check found that the requirements listed below are not supported by the grant as written, for the reason given under each. Rewrite each one so that it states only what the grant says, citing the passages it comes from. Keep its short name unless the name itself is unsupported. If the grant does not state the requirement at all, answer REMOVE instead of rewriting it.

For each requirement, in order, write exactly one line in one of these two forms, and nothing else:
[E3] NAME: <short name> || TEXT: <one to three sentences>
[E3] REMOVE

<requirements>
${list}
</requirements>`);
  }
  if (deadline) {
    parts.push(`The grant above was summarized, and its application deadline was recorded as ${deadline.value}, but ${deadline.reason.charAt(0).toLowerCase()}${deadline.reason.slice(1)} Write one line in one of these two forms, giving the application deadline the grant states and citing it, or REMOVE if the grant states none:
[AD] DATE: <YYYY-MM-DD>
[AD] REMOVE`);
  }
  return parts.join("\n\n");
}

const ANSWER = /^\s*\[([EDNK]\d+|AD)\]\s*(.*)$/;

/** Answers per id from the rewrite's text: `{ remove }`, `{ item, description }` or `{ date }`. */
export function parseRewrite(content) {
  const text = (content || []).filter((b) => b?.type === "text").map((b) => b.text || "").join("");
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(ANSWER);
    if (!m || out.has(m[1])) continue;
    const rest = m[2].trim();
    if (/^REMOVE\b/i.test(rest)) out.set(m[1], { remove: true });
    else if (m[1] === "AD") {
      const date = rest.match(/DATE:\s*(\d{4}-\d{2}-\d{2})/i);
      if (date) out.set("AD", { date: date[1] });
    } else {
      const parts = rest.match(/NAME:\s*(.+?)\s*\|\|\s*TEXT:\s*(.+)$/i);
      if (parts && parts[1].trim() && parts[2].trim()) out.set(m[1], { item: parts[1].trim(), description: parts[2].trim() });
    }
  }
  return out;
}

async function rewriteItems(nofoName, rawText, failing, deadline) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: Math.min(32000, 2000 + failing.length * 400),
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "text", media_type: "text/plain", data: rawText },
            title: nofoName,
            citations: { enabled: true },
          },
          { type: "text", text: rewritePrompt(failing, deadline) },
        ],
      },
    ],
  };
  const response = await invokeBedrockWithRetry({
    modelId: process.env.SONNET_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });
  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  if (parsed.stop_reason === "refusal") {
    console.warn(`Sonnet declined to rewrite items for ${nofoName} (${parsed.stop_details?.category ?? "no category"}); they stay as they are`);
    return new Map();
  }
  if (parsed.stop_reason === "max_tokens") console.warn(`Rewrite for ${nofoName} was cut off; using the answers so far`);
  return parseRewrite(parsed.content);
}

function replaceItems(summary, answers) {
  const out = { ...summary };
  for (const { category, index, answer } of answers) {
    if (out[category] === summary[category]) out[category] = [...summary[category]];
    out[category][index] = { ...summary[category][index], item: answer.item, description: answer.description };
  }
  return out;
}

const grantTextFailure = (reason) => ({ category: "grant_text", item: "All requirements", reason });

/**
 * One grant: `{ summary, citationsFile, failing: [{category, item, reason}], rewritten }`. `summary`
 * carries only rewrites that passed. `citationsFile` is null when the text could not be checked.
 */
export async function verifyRequirements({ nofoName, summary, rawText, pageStarts = null, rewrite = true }) {
  if (!rawText?.trim()) {
    return { summary, citationsFile: null, failing: [grantTextFailure("The grant text is missing, so no requirement could be checked.")], rewritten: [] };
  }
  if (rawText.length > MAX_TEXT_CHARS) {
    return { summary, citationsFile: null, failing: [grantTextFailure("The grant text is too long to check in one pass.")], rewritten: [] };
  }

  const keys = sourceKeys([rawText]);
  const items = requirementItems(summary);
  const first = await checkItems(nofoName, rawText, items, keys);
  const byId = new Map(first.byId);
  const verdicts = new Map(first.verdicts);
  const deadline = summary?.application_deadline || null;
  let deadlineReason = deadline ? deadlineProblem(deadline, keys) : null;
  let finalSummary = summary;
  const rewritten = [];

  const failing = items.filter((i) => !verdicts.get(i.id).ok).map((i) => ({ ...i, reason: verdicts.get(i.id).reason }));
  if (rewrite && (failing.length || deadlineReason)) {
    const answers = await rewriteItems(nofoName, rawText, failing, deadlineReason ? { value: deadline, reason: deadlineReason } : null);
    const candidates = [];
    for (const item of failing) {
      const answer = answers.get(item.id);
      if (!answer) verdicts.set(item.id, { ok: false, reason: `${item.reason} The automatic rewrite gave no answer.` });
      else if (answer.remove) verdicts.set(item.id, { ok: false, reason: `${item.reason} The automatic rewrite found nothing in the grant that states it.` });
      else candidates.push({ ...item, answer });
    }

    if (candidates.length) {
      const candidateSummary = replaceItems(summary, candidates);
      const ids = new Set(candidates.map((c) => c.id));
      const second = await checkItems(nofoName, rawText, requirementItems(candidateSummary).filter((i) => ids.has(i.id)), keys);
      const passed = [];
      for (const c of candidates) {
        const v = second.verdicts.get(c.id);
        if (v?.ok) {
          passed.push(c);
          byId.set(c.id, second.byId.get(c.id) ?? []);
          verdicts.set(c.id, v);
          rewritten.push(c.id);
        } else {
          verdicts.set(c.id, { ok: false, reason: `${c.reason} A rewrite was tried but could not be confirmed either: ${v?.reason ?? "no answer"}` });
        }
      }
      if (passed.length) finalSummary = replaceItems(summary, passed);
    }

    if (deadlineReason) {
      const answer = answers.get("AD");
      if (answer?.date && !deadlineProblem(answer.date, keys)) {
        finalSummary = { ...finalSummary, application_deadline: answer.date };
        deadlineReason = null;
        rewritten.push("AD");
      } else if (answer?.remove) {
        deadlineReason = `${deadlineReason} The automatic rewrite found no application deadline in the grant.`;
      } else {
        deadlineReason = `${deadlineReason} The automatic rewrite could not confirm a date.`;
      }
    }
  }

  const finalItems = requirementItems(finalSummary);
  const out = finalItems
    .filter((i) => !verdicts.get(i.id)?.ok)
    .map((i) => ({ category: i.category, item: clip(i.item || i.description, ITEM_MAX_CHARS), reason: clip(verdicts.get(i.id)?.reason, REASON_MAX_CHARS) }));
  if (deadlineReason) out.push({ category: "application_deadline", item: String(deadline), reason: clip(deadlineReason, REASON_MAX_CHARS) });

  return {
    summary: finalSummary,
    citationsFile: citationsFile(finalItems, byId, { textChars: rawText.length, pageStarts, model: process.env.HAIKU_MODEL_ID }),
    failing: out,
    rewritten,
  };
}
