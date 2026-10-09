/**
 * A function that can't load its code never reaches its handler, so none of its own error handling or
 * log markers run. This finds those failures for every Lambda under the stack name, including ones
 * added later. Only names, error types and first lines are logged.
 */
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  GetQueryResultsCommand,
  StartQueryCommand,
  StopQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

/** The schedule is 15 minutes; the overlap covers log ingestion lag. */
export const WINDOW_MINUTES = 17;
/** Logs Insights accepts at most 50 log groups per query. */
export const MAX_GROUPS_PER_QUERY = 50;
const POLL_MS = 1_000;
const QUERY_DEADLINE_MS = 120_000;
const MAX_MESSAGE_CHARS = 300;

export const QUERY = [
  "fields @timestamp, @log, @message",
  "| filter @message like /Init Error|Runtime\\.UserCodeSyntaxError|Runtime\\.ImportModuleError|INIT_REPORT.*Status: error/",
  "| sort @timestamp asc",
  "| limit 10000",
].join("\n");

export async function listLogGroups(logs, prefix, exclude) {
  const names = [];
  let nextToken;
  do {
    const page = await logs.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: prefix, nextToken }));
    for (const group of page.logGroups ?? []) {
      if (group.logGroupName && group.logGroupName !== exclude) names.push(group.logGroupName);
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return names;
}

export function batches(items, size = MAX_GROUPS_PER_QUERY) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function queryWindow(nowMs) {
  const endTime = Math.floor(nowMs / 1000);
  return { startTime: endTime - WINDOW_MINUTES * 60, endTime };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runQuery(logs, logGroupNames, window, { pollMs = POLL_MS, deadlineMs = QUERY_DEADLINE_MS } = {}) {
  const { queryId } = await logs.send(
    new StartQueryCommand({ logGroupNames, queryString: QUERY, startTime: window.startTime, endTime: window.endTime }),
  );
  const giveUpAt = Date.now() + deadlineMs;
  for (;;) {
    const result = await logs.send(new GetQueryResultsCommand({ queryId }));
    if (result.status === "Complete") return result.results ?? [];
    if (["Failed", "Cancelled", "Timeout", "Unknown"].includes(result.status)) {
      throw new Error(`Logs Insights query ${queryId} ended with status ${result.status}`);
    }
    if (Date.now() >= giveUpAt) {
      await logs.send(new StopQueryCommand({ queryId })).catch(() => {});
      throw new Error(`Logs Insights query ${queryId} did not finish in ${deadlineMs / 1000} s`);
    }
    await sleep(pollMs);
  }
}

/** "123456789012:/aws/lambda/name" -> "name" */
export function functionNameOf(log) {
  const marker = "/aws/lambda/";
  const at = (log ?? "").lastIndexOf(marker);
  return at >= 0 ? log.slice(at + marker.length) : log ?? "unknown";
}

function jsonPayload(message) {
  const start = message.indexOf("{");
  if (start < 0) return undefined;
  try {
    return JSON.parse(message.slice(start));
  } catch {
    return undefined;
  }
}

/** The error type and the first line a person needs, from one matching log line. */
export function describe(message) {
  const text = message ?? "";
  const payload = jsonPayload(text);
  const errorType =
    (typeof payload?.errorType === "string" && payload.errorType) ||
    text.match(/Error Type: (\S+)/)?.[1] ||
    text.match(/(Runtime\.\w+)/)?.[1] ||
    "unknown";
  const raw =
    typeof payload?.errorMessage === "string"
      ? payload.errorMessage
      : text.replace(/^\[ERROR\]\s*/, "");
  const firstLine = raw.split(/\r?\n/)[0].replace(/\t/g, " ").trim().slice(0, MAX_MESSAGE_CHARS);
  return { errorType, message: firstLine, isReport: text.startsWith("INIT_REPORT") };
}

/** Insights rows -> one entry per function. A runtime's own error line beats its INIT_REPORT summary. */
export function summarize(rows) {
  const byFunction = new Map();
  for (const row of rows) {
    const fields = Object.fromEntries(row.map(({ field, value }) => [field, value]));
    const functionName = functionNameOf(fields["@log"]);
    const found = describe(fields["@message"]);
    const entry = byFunction.get(functionName);
    if (!entry) {
      byFunction.set(functionName, { functionName, ...found, count: 1 });
      continue;
    }
    entry.count += 1;
    if (entry.isReport && !found.isReport) Object.assign(entry, { errorType: found.errorType, message: found.message, isReport: false });
  }
  return [...byFunction.values()]
    .map(({ isReport, ...rest }) => rest)
    .sort((a, b) => a.functionName.localeCompare(b.functionName));
}

export async function scan({ logs, cloudwatch, env, nowMs, queryOptions }) {
  const groups = await listLogGroups(logs, env.LOG_GROUP_PREFIX, env.EXCLUDE_LOG_GROUP);
  const window = queryWindow(nowMs);
  const rows = [];
  for (const batch of batches(groups)) rows.push(...(await runQuery(logs, batch, window, queryOptions)));
  const affected = summarize(rows);

  await cloudwatch.send(
    new PutMetricDataCommand({
      Namespace: env.METRIC_NAMESPACE,
      MetricData: [{ MetricName: env.METRIC_NAME, Value: rows.length, Unit: "Count", Timestamp: new Date(nowMs) }],
    }),
  );
  for (const f of affected) {
    console.error(`Lambda init error in ${f.functionName}: ${f.errorType}: ${f.message} (${f.count} matching lines)`);
  }
  return { logGroups: groups.length, initErrorLines: rows.length, affected };
}

const logs = new CloudWatchLogsClient({});
const cloudwatch = new CloudWatchClient({});

export const handler = async () => {
  const summary = await scan({ logs, cloudwatch, env: process.env, nowMs: Date.now() });
  console.log(JSON.stringify({ logGroups: summary.logGroups, initErrorLines: summary.initErrorLines }));
  return summary;
};
