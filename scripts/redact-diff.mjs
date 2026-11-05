#!/usr/bin/env node
// Redacts secrets from `cdk diff` output (stdin to stdout) before CI prints or uploads it.
// Pattern redaction also catches values the exact match can't, such as a rotated-out old key.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SECRET_ENV_NAMES = ['GRANTS_GOV_API_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'];

const NAME = '[A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD)[A-Z0-9_]*';
const JSON_PAIR = new RegExp(`("${NAME}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'g');
const ESCAPED_JSON_PAIR = new RegExp(`(\\\\"${NAME}\\\\"\\s*:\\s*)\\\\"(?:[^"\\\\]|\\\\[^"])*\\\\"`, 'g');
const ASSIGNMENT = new RegExp(`\\b(${NAME})=[^\\s"',;]+`, 'g');
// cdk diff's tree form: a `.NAME:` line, then the old and new values on deeper lines.
const TREE_KEY = new RegExp(`─ \\[[-+~]\\] \\.${NAME}:\\s*$`);
const TREE_VALUE = /^(.*?─ (?:\[[-+~]\] )?).*$/;

const depth = (line) => line.indexOf('─');

export function redactDiff(text, secrets = {}) {
  for (const key of SECRET_ENV_NAMES) {
    const value = secrets[key];
    if (value) text = text.split(value).join(`<${key}>`);
  }
  const lines = text.split('\n');
  let keyDepth = -1;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (keyDepth >= 0) {
      if (depth(line) > keyDepth) {
        lines[i] = line.replace(TREE_VALUE, '$1<redacted>');
        continue;
      }
      keyDepth = -1;
    }
    if (TREE_KEY.test(line)) keyDepth = depth(line);
    line = line.replace(JSON_PAIR, '$1"<redacted>"');
    line = line.replace(ESCAPED_JSON_PAIR, '$1\\"<redacted>\\"');
    lines[i] = line.replace(ASSIGNMENT, '$1=<redacted>');
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(redactDiff(readFileSync(0, 'utf8'), process.env));
}
