#!/usr/bin/env node
// Fails when added lines introduce a color outside the designated palette.
// Only changed lines are checked, so existing literals don't block unrelated work.
//
//   npm run lint:colors                      # working tree + untracked vs HEAD
//   npm run lint:colors -- --base origin/main
//   npm run lint:colors -- --base origin/main --warn   # report, exit 0
//
// Allowed: var(--token) for a token defined in tokens.css, optionally with a fallback
// equal to that token's value. Append `color-lint-allow` to a line to exempt it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_FILE = "src/styles/tokens.css";

// Where palette values are defined, so literals are expected.
const PALETTE_FILES = [
  TOKENS_FILE,
  "src/components/ui/styles.ts",
  "src/common/branding.tsx",
];

const EXTENSIONS = [".css", ".scss", ".ts", ".tsx"];

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FUNC = /\b(?:rgba?|hsla?)\(/g;
const VAR_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g;

const baseArgIndex = process.argv.indexOf("--base");
const base = baseArgIndex > -1 ? process.argv[baseArgIndex + 1] : "HEAD";
const warnOnly = process.argv.includes("--warn");

const git = (...args) =>
  execFileSync("git", args, { cwd: appDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function normalizeHex(value) {
  let hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
  return hex;
}

function loadTokens() {
  const tokens = new Map();
  const css = readFileSync(path.join(appDir, TOKENS_FILE), "utf8");
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

function isChecked(file) {
  return (
    EXTENSIONS.some((ext) => file.endsWith(ext)) &&
    !PALETTE_FILES.some((p) => file === p || (p.endsWith("/") && file.startsWith(p))) &&
    !file.includes("/generated/")
  );
}

function addedLines() {
  const lines = [];
  const diff = git("diff", "-U0", "--no-color", "--relative", base, "--", ".");
  let file = null;
  let lineNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.startsWith("+++ b/") ? raw.slice(6) : null;
    } else if (raw.startsWith("@@")) {
      lineNo = Number(/\+(\d+)/.exec(raw)[1]);
    } else if (raw.startsWith("+") && file) {
      lines.push({ file, line: lineNo++, text: raw.slice(1) });
    }
  }
  const untracked = git("ls-files", "--others", "--exclude-standard", ".").split("\n").filter(Boolean);
  for (const file of untracked) {
    if (!isChecked(file)) continue;
    readFileSync(path.join(appDir, file), "utf8")
      .split("\n")
      .forEach((text, i) => lines.push({ file, line: i + 1, text }));
  }
  return lines.filter((l) => isChecked(l.file));
}

function problemsIn(text, tokens) {
  if (text.includes("color-lint-allow")) return [];
  const problems = [];
  const stripped = text.replace(VAR_REF, (match, name, fallback) => {
    const tokenValue = tokens.get(name);
    if (tokenValue === undefined) {
      if (/^--(gw-color|mk)-/.test(name)) problems.push(`${name} is not defined in ${TOKENS_FILE}`);
      return match;
    }
    if (fallback && fallback.trim() && normalizeHex(fallback) !== normalizeHex(tokenValue)) {
      problems.push(`fallback ${fallback.trim()} for ${name} does not match its token value ${tokenValue}`);
    }
    return "";
  });
  for (const [hex] of stripped.matchAll(HEX)) problems.push(`raw color ${hex}`);
  for (const [fn] of stripped.matchAll(FUNC)) problems.push(`raw color ${fn.slice(0, -1)}()`);
  return problems;
}

const tokens = loadTokens();
const failures = [];
for (const { file, line, text } of addedLines()) {
  for (const problem of problemsIn(text, tokens)) failures.push({ file, line, problem });
}

if (failures.length) {
  // Annotation paths must be repo-relative; ours are relative to the app dir.
  const repoPrefix = process.env.GITHUB_ACTIONS ? git("rev-parse", "--show-prefix").trim() : null;
  for (const { file, line, problem } of failures) {
    console.error(
      repoPrefix !== null
        ? `::${warnOnly ? "warning" : "error"} file=${repoPrefix}${file},line=${line}::${problem}`
        : `${file}:${line}  ${problem}`
    );
  }
  console.error(
    `\n${failures.length} color problem(s). Use a var(--gw-color-*) token from ${TOKENS_FILE}; ` +
      "if none fits, add one there and check its contrast."
  );
  process.exit(warnOnly ? 0 : 1);
}
console.log(`lint:colors: no new off-palette colors (vs ${base}).`);
