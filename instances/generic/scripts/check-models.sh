#!/usr/bin/env bash
# After a deploy: runs the deployment's model canary, one minimal call to every Bedrock model it uses,
# and fails if any model doesn't answer (model access off, a profile gone, a quota at zero).
# Usage: scripts/check-models.sh <outputs file>   written by `cdk deploy --outputs-file <file>`
# Needs the deploy's AWS credentials, plus lambda:InvokeFunction on the canary.
set -euo pipefail

outputs=${1:?Usage: scripts/check-models.sh <outputs file from cdk deploy --outputs-file>}

fn=$(node -e '
  const outputs = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const names = Object.values(outputs).map((stack) => stack.ModelCanaryFunctionName).filter(Boolean);
  if (names.length !== 1) {
    console.error(`Expected one ModelCanaryFunctionName stack output in ${process.argv[1]}, found ${names.length}.`);
    process.exit(1);
  }
  console.log(names[0]);
' "$outputs")

payload=$(mktemp)
trap 'rm -f "$payload"' EXIT
meta=$(aws lambda invoke --function-name "$fn" --cli-binary-format raw-in-base64-out --payload '{}' \
  --cli-read-timeout 180 --output json "$payload")

node -e '
  const meta = JSON.parse(process.argv[1]);
  const text = require("fs").readFileSync(process.argv[2], "utf8");
  let result;
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  if (meta.FunctionError || result.ok !== true) {
    for (const line of String(result.errorMessage ?? JSON.stringify(result)).split("\n")) console.log(`::error::${line}`);
    process.exit(1);
  }
  for (const r of result.results) console.log(`ok  ${r.model}`);
' "$meta" "$payload"
