// usage: node eval/check-golden.mjs [slug ...]   Checks golden files against their source text and the README's rules.
import fs from "node:fs";
import path from "node:path";
import { GOLDEN_DIR, loadGrants, readOptional } from "./lib/golden.mjs";

const squash = (s) => String(s).replace(/\s+/g, " ").trim();
const DEADLINE_KINDS = new Set(["application", "loi", "preapp", "other"]);
const LIMIT_TYPES = new Set(["pages", "words", "chars", "paragraphs"]);
const STATUSES = new Set(["prelabeled", "checked", "confirmed"]);
const CHAT_KINDS = new Set(["deadline", "eligibility", "award", "limits", "documents", "absent", "allowable_cost"]);
const VERDICTS = new Set(["allowed", "not_allowed", "conditional"]);

function quotes(node, at, out) {
  if (Array.isArray(node)) node.forEach((v, i) => quotes(v, `${at}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "quote" && v !== null) out.push([`${at}.quote`, v]);
      else quotes(v, `${at}.${k}`, out);
    }
  }
  return out;
}

export function checkGrant(grant) {
  const problems = [];
  const text = squash(fs.readFileSync(grant.rawPath, "utf8"));
  const verbatim = (file, json) => {
    for (const [at, q] of quotes(json, "", [])) {
      if (typeof q !== "string" || !q.trim()) problems.push(`${file}${at}: empty quote`);
      else if (!text.includes(squash(q))) problems.push(`${file}${at}: not in raw.txt: "${q.slice(0, 60)}"`);
    }
  };

  const gold = readOptional(grant, "gold.json");
  if (gold) {
    verbatim("gold.json", gold);
    if (gold.schemaVersion !== 1) problems.push("gold.json: schemaVersion must be 1");
    if (!STATUSES.has(gold.status)) problems.push(`gold.json: status "${gold.status}"`);
    for (const k of ["family", "deadlines", "award", "sections", "criteria", "format", "eligibility", "requiredDocuments", "libraryRequired"]) {
      if (!(k in gold)) problems.push(`gold.json: missing ${k}`);
    }
    for (const [i, d] of (gold.deadlines ?? []).entries()) {
      if (!DEADLINE_KINDS.has(d.kind)) problems.push(`gold.json.deadlines[${i}]: kind "${d.kind}"`);
      if (d.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? "")) problems.push(`gold.json.deadlines[${i}]: date "${d.date}"`);
    }
    for (const [i, s] of (gold.sections ?? []).entries()) {
      if (s.limit && !LIMIT_TYPES.has(s.limit.type)) problems.push(`gold.json.sections[${i}]: limit type "${s.limit.type}"`);
    }
    for (const [i, c] of (gold.criteria ?? []).entries()) {
      if (c.points != null && c.weightPct != null) problems.push(`gold.json.criteria[${i}]: both points and weightPct`);
      if (typeof c.scored !== "boolean") problems.push(`gold.json.criteria[${i}]: scored must be true or false`);
    }
    const expected = gold.award?.expectedAwards;
    if (expected != null && typeof expected !== "number" && !(typeof expected === "object" && "min" in expected && "max" in expected)) {
      problems.push("gold.json.award.expectedAwards: number, {min, max} or null");
    }
    for (const [i, d] of (gold.deadlines ?? []).entries()) {
      if (/\bAIDS\b/.test(d.label ?? "")) problems.push(`gold.json.deadlines[${i}]: AIDS due dates are left out (NOT-OD-26-029)`);
    }
    if ((gold.deadlines ?? []).every((d) => d.kind !== "application")) problems.push("gold.json: no application deadline");
  }

  const chat = readOptional(grant, "chat.json");
  if (chat) {
    verbatim("chat.json", chat);
    const ids = new Set();
    for (const q of chat) {
      if (ids.has(q.id)) problems.push(`chat.json: duplicate id ${q.id}`);
      ids.add(q.id);
      if (!CHAT_KINDS.has(q.kind)) problems.push(`chat.json ${q.id}: kind "${q.kind}"`);
      if (q.kind === "absent" && q.quote !== null) problems.push(`chat.json ${q.id}: absent with a quote`);
      if (q.kind === "allowable_cost" && !VERDICTS.has(q.verdict)) problems.push(`chat.json ${q.id}: verdict "${q.verdict}"`);
    }
  }
  return { gold: Boolean(gold), chat: Boolean(chat), problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const grants = loadGrants(GOLDEN_DIR, only.length ? only : undefined);
  let failed = 0;
  for (const grant of grants) {
    const { gold, chat, problems } = checkGrant(grant);
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${grant.slug}${gold ? "" : " (no gold.json)"}${chat ? "" : " (no chat.json)"}`);
    for (const p of problems) console.log(`     ${p}`);
  }
  console.log(`${grants.length - failed}/${grants.length} clean in ${path.relative(process.cwd(), GOLDEN_DIR) || GOLDEN_DIR}`);
  process.exitCode = failed ? 1 : 0;
}
