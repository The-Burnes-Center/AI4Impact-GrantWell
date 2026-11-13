/**
 * The one-time check of live grants. A dry run (`{ verifyLive: true }`) verifies every active and
 * archived grant and writes `_verification/<id>.json`; it changes nothing else. A grant whose check
 * errors is retried once later in the same run, then reported as `error` and never unpublished.
 * `{ verifyLive: true, apply: true, reportId }` sends exactly the failing grants in that report to
 * the review queue through the Quarantine Lambda, the way a new failing grant lands there, noting
 * the status each had so approval can restore it. Published items are never rewritten.
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { isMissingObject, putArtifact, readArtifactText } from "grantwell-shared";
import { pageMapKey, usablePageStarts } from "../extract-text/page-map.mjs";
import { CITATIONS_FILE, itemsHash, requirementItems } from "../shared/cite.mjs";
import { verifyRequirements } from "../shared/verify-requirements.mjs";
import { unverifiedItemsGuidance } from "../shared/unverified-guidance.mjs";

export const REPORT_PREFIX = "_verification/";
const REPORT_VERSION = 1;
const CONCURRENCY = 4;
const ROUND_BUDGET_MS = 12 * 60 * 1000;
const MAX_ROUNDS = 40;
const REPORT_ID = /^[\w.-]{1,80}$/;
const LIVE_STATUSES = ["active", "archived"];
const MAX_ATTEMPTS = 2;

const s3 = new S3Client();
const dynamo = new DynamoDBClient();
const lambda = new LambdaClient();

const reportKey = (id) => `${REPORT_PREFIX}${id}.json`;

async function readOptional(key) {
  try {
    return await readArtifactText(s3, key);
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

const parseOrNull = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

async function readReport(id) {
  if (!REPORT_ID.test(String(id ?? ""))) throw new Error(`Not a report id: ${id}`);
  const report = parseOrNull(await readOptional(reportKey(id)));
  if (!report) throw new Error(`No verification report ${id}`);
  return report;
}

const writeReport = (report) => putArtifact(s3, reportKey(report.id), JSON.stringify(report, null, 2), "application/json");

/** Active and archived grants not mid-pipeline: `{ name: status }`. */
export async function liveGrants() {
  const statuses = {};
  for (const status of LIVE_STATUSES) {
    let ExclusiveStartKey;
    do {
      const page = await dynamo.send(
        new QueryCommand({
          TableName: process.env.NOFO_METADATA_TABLE_NAME,
          IndexName: "StatusIndex",
          KeyConditionExpression: "#s = :s",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: marshall({ ":s": status }),
          ExclusiveStartKey,
        })
      );
      for (const row of (page.Items ?? []).map((i) => unmarshall(i))) {
        if (row.nofo_name && !row.processing_status && !statuses[row.nofo_name]) statuses[row.nofo_name] = status;
      }
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
  return statuses;
}

const deadlineOf = (summary) => summary?.application_deadline || null;

/** An admin approved exactly these items (and deadline) after review, so they are not re-flagged. */
export function approvedAsIs(approval, summary) {
  return Boolean(
    approval &&
      approval.itemsHash === itemsHash(requirementItems(summary)) &&
      (approval.applicationDeadline ?? null) === deadlineOf(summary)
  );
}

async function checkGrant(name) {
  const [summaryText, rawText, mapText, citationsText] = await Promise.all([
    readOptional(`${name}/summary.json`),
    readOptional(`${name}/raw-text.txt`),
    readOptional(pageMapKey(name)),
    readOptional(`${name}/${CITATIONS_FILE}`),
  ]);
  const summary = parseOrNull(summaryText);
  if (!summary) return { result: "skipped", why: "no readable summary.json" };
  const hash = itemsHash(requirementItems(summary));
  const approval = parseOrNull(citationsText)?.approval;
  if (approvedAsIs(approval, summary)) return { result: "approved", approvedAt: approval.at ?? null, itemsHash: hash };

  let pageStarts = null;
  try {
    pageStarts = mapText && rawText ? usablePageStarts(JSON.parse(mapText), rawText) : null;
  } catch {}
  const { failing } = await verifyRequirements({ nofoName: name, summary, rawText, pageStarts, rewrite: false });
  return {
    result: failing.length ? "failing" : "passed",
    itemsHash: hash,
    applicationDeadline: deadlineOf(summary),
    ...(failing.length && { failing }),
  };
}

function summarize(report) {
  const counts = {};
  for (const r of Object.values(report.results)) counts[r.result] = (counts[r.result] ?? 0) + 1;
  report.counts = counts;
  report.checked = Object.keys(report.results).length;
  report.failing = report.grants
    .filter((g) => report.results[g]?.result === "failing")
    .map((g) => ({ grant: g, ...(report.statuses?.[g] && { status: report.statuses[g] }), items: report.results[g].failing }));
  report.errors = report.grants
    .filter((g) => report.results[g]?.result === "error")
    .map((g) => ({ grant: g, error: report.results[g].error, attempts: report.results[g].attempts ?? 1 }));
}

const retryable = (result) => result?.result === "error" && (result.attempts ?? 1) < MAX_ATTEMPTS;

/** Grants still to check: unchecked ones first, then errored ones on their retry. */
const pendingOf = (report) => [
  ...report.grants.filter((g) => !report.results[g]),
  ...report.grants.filter((g) => retryable(report.results[g])),
];

async function dryRun(event, remainingMs) {
  const started = Date.now();
  const round = Number(event.round) || 1;
  let report;
  if (event.reportId) {
    report = await readReport(event.reportId);
  } else {
    const now = new Date();
    const statuses = await liveGrants();
    report = {
      version: REPORT_VERSION,
      id: now.toISOString().replace(/[:]/g, "-"),
      startedAt: now.toISOString(),
      finishedAt: null,
      complete: false,
      grants: Object.keys(statuses).sort(),
      statuses,
      results: {},
      applied: null,
    };
  }
  if (report.complete) return { reportId: report.id, complete: true, ...report.counts };

  let outOfTime = false;
  let saving = Promise.resolve();
  const save = () => {
    saving = saving.then(() => {
      summarize(report);
      return writeReport(report);
    });
    return saving;
  };
  await save();

  // A grant that errors goes back on the list, so it is retried after every other grant is checked.
  let todo = pendingOf(report);
  while (todo.length && !outOfTime) {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
        while (next < todo.length) {
          if (Date.now() - started > ROUND_BUDGET_MS || remainingMs() < 2 * 60 * 1000) {
            outOfTime = true;
            return;
          }
          const name = todo[next++];
          const attempts = report.results[name]?.result === "error" ? (report.results[name].attempts ?? 1) + 1 : 1;
          try {
            report.results[name] = await checkGrant(name);
          } catch (error) {
            console.error(`Could not verify ${name} (attempt ${attempts}):`, error.message);
            report.results[name] = { result: "error", error: String(error.message).slice(0, 300), attempts };
          }
          await save();
        }
      })
    );
    todo = pendingOf(report);
  }

  report.complete = pendingOf(report).length === 0;
  if (report.complete) report.finishedAt = new Date().toISOString();
  await save();
  console.log(`Live verification ${report.id} round ${round}: ${report.checked}/${report.grants.length} checked`, report.counts);

  const continued = !report.complete && round < MAX_ROUNDS && Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (continued) {
    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify({ verifyLive: true, apply: false, reportId: report.id, round: round + 1 }),
      })
    );
  }
  return { reportId: report.id, total: report.grants.length, checked: report.checked, complete: report.complete, continued, ...report.counts };
}

async function documentKeyOf(name) {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.BUCKET, Prefix: `${name}/NOFO-File-`, MaxKeys: 5 }));
  return page.Contents?.find((o) => o.Key.endsWith("NOFO-File-PDF") || o.Key.endsWith("NOFO-File-TXT"))?.Key ?? "";
}

async function unpublish(name, entry) {
  const meta = await dynamo.send(
    new GetItemCommand({ TableName: process.env.NOFO_METADATA_TABLE_NAME, Key: marshall({ nofo_name: name }) })
  );
  const row = meta.Item ? unmarshall(meta.Item) : null;
  if (!LIVE_STATUSES.includes(row?.status) || row.processing_status) {
    return { skipped: `it is no longer live (status ${row?.status ?? "missing"}${row?.processing_status ? `, ${row.processing_status}` : ""})` };
  }
  const [summaryText, questionsText] = await Promise.all([readOptional(`${name}/summary.json`), readOptional(`${name}/questions.json`)]);
  const summary = parseOrNull(summaryText);
  if (!summary) return { skipped: "summary.json is missing" };
  if (itemsHash(requirementItems(summary)) !== entry.itemsHash || deadlineOf(summary) !== (entry.applicationDeadline ?? null)) {
    return { skipped: "its requirements changed after the report; run a new dry run" };
  }

  const payload = {
    nofoName: name,
    s3Bucket: process.env.BUCKET,
    rawTextKey: `${name}/raw-text.txt`,
    documentKey: await documentKeyOf(name),
    mergedSummary: summary,
    questionsData: parseOrNull(questionsText),
    validationResult: { overallVerdict: "NEEDS_REVIEW" },
    adminGuidance: unverifiedItemsGuidance(name, entry.failing, { live: row.status }),
    source: "verification",
    unpublish: true,
    previousStatus: row.status,
    retryCount: 0,
    qualityScore: 0,
  };
  const result = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.QUARANTINE_FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    })
  );
  if (result.FunctionError) {
    const detail = parseOrNull(new TextDecoder().decode(result.Payload ?? new Uint8Array()));
    throw new Error(`Quarantine failed for ${name}: ${detail?.errorMessage ?? result.FunctionError}`);
  }
  return { unpublished: true };
}

async function apply(event) {
  const report = await readReport(event.reportId);
  if (!report.complete) throw new Error(`Report ${report.id} is not complete yet; wait for the dry run to finish`);
  const previous = report.applied;
  if (previous && !previous.errors?.length) {
    return { reportId: report.id, alreadyApplied: previous.at, unpublished: previous.unpublished.length };
  }

  // A second apply only retries the grants that errored the first time.
  const grants = previous ? previous.errors.map((e) => e.grant) : (report.failing ?? []).map((f) => f.grant);
  const unpublished = [...(previous?.unpublished ?? [])];
  const skipped = [...(previous?.skipped ?? [])];
  const errors = [];
  for (const grant of grants) {
    try {
      const outcome = await unpublish(grant, report.results[grant]);
      if (outcome.unpublished) unpublished.push(grant);
      else skipped.push({ grant, why: outcome.skipped });
    } catch (error) {
      console.error(`Could not unpublish ${grant}:`, error.message);
      errors.push({ grant, error: String(error.message).slice(0, 300) });
    }
  }
  report.applied = { at: new Date().toISOString(), ...(previous && { firstAt: previous.firstAt ?? previous.at }), unpublished, skipped, errors };
  await writeReport(report);
  console.log(`Applied verification report ${report.id}: unpublished ${unpublished.length}, skipped ${skipped.length}, errors ${errors.length}`);
  return { reportId: report.id, unpublished: unpublished.length, skipped: skipped.length, errors: errors.length };
}

export function verifyLive(event, remainingMs) {
  if (event.apply === true) {
    if (!event.reportId) throw new Error("apply needs the reportId of a finished dry run");
    return apply(event);
  }
  return dryRun(event, remainingMs);
}
