import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  requireAdmin,
  resolveCallerScope,
  getSupportedStateCodes,
  stateNameFromCode,
} from "grantwell-shared";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "us-east-1" });

const TABLE_NAME = process.env.ANALYTICS_TABLE_NAME;
const DRAFT_TABLE_NAME = process.env.DRAFT_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;
const MAX_LIST_PAGES = 50;
const ALLOWED_WINDOWS = new Set([7, 30, 90]);
const TOP_N = 10;

// Grant-application funnel, in order. Reaching "submitted" = completed; anything short of it,
// once stale, is an abandonment. Mirrors the DraftTable status lifecycle (shared/models.py).
const DRAFT_FUNNEL_STAGES = [
  "project_basics",
  "questionnaire",
  "uploading_documents",
  "generating_draft",
  "editing_sections",
  "reviewing",
  "submitted",
];

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return respond(200, {});
  }
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  if (!TABLE_NAME) {
    return respond(500, { message: "Analytics is not configured" });
  }

  try {
    const scope = resolveCallerScope(event);
    const windowDays = normalizeWindow(event.queryStringParameters?.window);
    // A state admin is always locked to their own state. Developers/regular admins default to all
    // states, but may narrow to one via ?state=XX (ignored if not a supported code).
    const supported = getSupportedStateCodes();
    const requestedState = String(event.queryStringParameters?.state || "").trim().toUpperCase();
    const stateFilter =
      scope.role === "stateAdmin"
        ? scope.state
        : supported.has(requestedState)
        ? requestedState
        : null;

    // Each slice is independently guarded so one failing read degrades to empty rather than 500ing
    // the whole tab (matches nofo-pipeline/admin getMetrics resilience).
    const [profiles, events, registered, drafts] = await Promise.all([
      safe(() => scanProfiles(), []),
      safe(() => queryEventsWithin(windowDays), []),
      safe(() => countRegisteredByState(), {}),
      safe(() => scanDraftStatuses(), []),
    ]);

    const scopedProfiles = stateFilter
      ? profiles.filter((p) => p.state === stateFilter)
      : profiles;
    const scopedEvents = stateFilter
      ? events.filter((e) => (e.state || profileStateOf(profiles, e.user_id)) === stateFilter)
      : events;

    const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

    // Draft funnel is point-in-time (current status per draft). Scope by the draft owner's state.
    const scopedDrafts = stateFilter
      ? drafts.filter((d) => (profileByUser.get(d.user_id)?.state || "") === stateFilter)
      : drafts;

    return respond(200, {
      window: windowDays,
      generatedAt: new Date().toISOString(),
      usersByState: buildUsersByState(registered, scopedProfiles, windowDays, stateFilter),
      totalRegistered: stateFilter ? registered[stateFilter] || 0 : sumValues(registered),
      activeUsers: countActive(scopedProfiles, windowDays),
      topSearches: topBy(scopedEvents, "search", (e) => normalizeQuery(e.query_text)),
      topViewedNofos: topBy(scopedEvents, "nofo_view", (e) => e.nofo_name),
      topPursuedNofos: topBy(scopedEvents, "nofo_pursue", (e) => e.nofo_name),
      draftsCreated: countType(scopedEvents, "draft_created"),
      draftsDownloaded: countType(scopedEvents, "draft_downloaded"),
      draftsCompleted: countType(scopedEvents, "draft_completed"),
      usageByAgency: buildUsageByAgency(scopedEvents, profileByUser),
      draftFunnel: buildDraftFunnel(scopedDrafts),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return respond(500, { message: error?.message || "Analytics request failed" });
  }
};

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn("Analytics slice failed (degraded):", err?.message);
    return fallback;
  }
}

function normalizeWindow(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return ALLOWED_WINDOWS.has(parsed) ? parsed : 30;
}

// --- DynamoDB reads ---

// Profile rows: pk=USER#<id>, sk=PROFILE. Scanned once (there is one per user); the FilterExpression
// keeps event rows out. This mirrors the getMetrics scan approach and is fine at admin-console scale.
async function scanProfiles() {
  const profiles = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "sk = :p",
        ExpressionAttributeValues: marshall({ ":p": "PROFILE" }),
        ExclusiveStartKey: lastKey,
      })
    );
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      profiles.push({
        user_id: String(item.pk || "").replace(/^USER#/, ""),
        agency: item.agency || "",
        organization: item.organization || "",
        state: typeof item.state === "string" ? item.state.toUpperCase() : "",
        last_active_at: item.last_active_at || null,
      });
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return profiles;
}

// Event rows for the last `windowDays` days, read via the sparse EventDayIndex one day at a time
// (bounded fan-out) so we never scan the whole table.
async function queryEventsWithin(windowDays) {
  const days = lastNDays(windowDays);
  const perDay = await Promise.all(days.map((day) => queryEventsForDay(day)));
  return perDay.flat();
}

async function queryEventsForDay(day) {
  const events = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "EventDayIndex",
        KeyConditionExpression: "event_day = :d",
        ExpressionAttributeValues: marshall({ ":d": day }),
        ExclusiveStartKey: lastKey,
      })
    );
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      events.push({
        event_type: item.event_type || "",
        user_id: String(item.pk || "").replace(/^USER#/, ""),
        state: typeof item.state === "string" ? item.state.toUpperCase() : "",
        nofo_name: item.nofo_name || "",
        query_text: item.query_text || "",
      });
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return events;
}

// Current status of every draft, for the point-in-time application funnel. Scans DraftTable
// (one row per draft); projects only the two attributes we need to keep the scan cheap.
async function scanDraftStatuses() {
  if (!DRAFT_TABLE_NAME) return [];
  const drafts = [];
  let lastKey;
  do {
    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: DRAFT_TABLE_NAME,
        ProjectionExpression: "user_id, #s",
        ExpressionAttributeNames: { "#s": "status" },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const raw of result.Items || []) {
      const item = unmarshall(raw);
      drafts.push({
        user_id: String(item.user_id || ""),
        status: typeof item.status === "string" ? item.status : "project_basics",
      });
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return drafts;
}

// Registered user counts per state from Cognito. ListUsers can't filter custom attributes, so we
// page through and bucket by custom:state in memory (same constraint the users handler works around).
async function countRegisteredByState() {
  if (!USER_POOL_ID) return {};
  const counts = {};
  let paginationToken;
  let pages = 0;
  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        ...(paginationToken ? { PaginationToken: paginationToken } : {}),
      })
    );
    for (const user of response.Users || []) {
      const attrs = Object.fromEntries(
        (user.Attributes || []).map((a) => [a.Name, a.Value || ""])
      );
      const state = String(attrs["custom:state"] || "").trim().toUpperCase();
      const key = state || "UNASSIGNED";
      counts[key] = (counts[key] || 0) + 1;
    }
    paginationToken = response.PaginationToken;
    pages += 1;
  } while (paginationToken && pages < MAX_LIST_PAGES);
  if (pages >= MAX_LIST_PAGES && paginationToken) {
    console.warn(`countRegisteredByState hit the ${MAX_LIST_PAGES}-page cap; counts may be truncated.`);
  }
  return counts;
}

// --- Aggregations ---

function profileStateOf(profiles, userId) {
  const p = profiles.find((x) => x.user_id === userId);
  return p ? p.state : "";
}

function isActiveWithin(lastActiveAt, windowDays) {
  if (!lastActiveAt) return false;
  const t = new Date(lastActiveAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= windowDays * 86400000;
}

function countActive(profiles, windowDays) {
  return profiles.filter((p) => isActiveWithin(p.last_active_at, windowDays)).length;
}

// One row per supported state (plus any state seen in data): registered count from Cognito,
// active count from profile last_active_at. When scoped to one state, only that row is returned.
function buildUsersByState(registered, profiles, windowDays, stateFilter) {
  const codes = new Set([
    ...getSupportedStateCodes(),
    ...Object.keys(registered).filter((k) => k !== "UNASSIGNED"),
    ...profiles.map((p) => p.state).filter(Boolean),
  ]);
  const activeByState = {};
  for (const p of profiles) {
    if (p.state && isActiveWithin(p.last_active_at, windowDays)) {
      activeByState[p.state] = (activeByState[p.state] || 0) + 1;
    }
  }
  return [...codes]
    .filter((code) => !stateFilter || code === stateFilter)
    .map((code) => ({
      state: code,
      stateName: stateNameFromCode(code),
      registered: registered[code] || 0,
      active: activeByState[code] || 0,
    }))
    .sort((a, b) => b.registered - a.registered || a.state.localeCompare(b.state));
}

function normalizeQuery(text) {
  return String(text || "").trim().toLowerCase();
}

function countType(events, type) {
  return events.filter((e) => e.event_type === type).length;
}

// Top-N distinct values for a given event type, by frequency.
function topBy(events, type, keyOf) {
  const counts = new Map();
  for (const e of events) {
    if (e.event_type !== type) continue;
    const key = keyOf(e);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOP_N);
}

// Usage (event volume) grouped by the acting user's agency, joined from their profile row.
function buildUsageByAgency(events, profileByUser) {
  const byAgency = new Map();
  for (const e of events) {
    const profile = profileByUser.get(e.user_id);
    const agency = (profile?.agency || "").trim() || "Unknown";
    const state = profile?.state || e.state || "";
    const key = `${state}::${agency}`;
    const entry = byAgency.get(key) || { agency, state, events: 0 };
    entry.events += 1;
    byAgency.set(key, entry);
  }
  return [...byAgency.values()]
    .sort((a, b) => b.events - a.events || a.agency.localeCompare(b.agency))
    .slice(0, TOP_N);
}

// Point-in-time grant-application funnel: how many drafts currently sit at each stage, plus
// completed (submitted), abandoned (stalled short of submitted — every non-terminal stage), and a
// completion rate. Unknown statuses fall back to the first stage.
function buildDraftFunnel(drafts) {
  const byStage = Object.fromEntries(DRAFT_FUNNEL_STAGES.map((s) => [s, 0]));
  for (const d of drafts) {
    const stage = DRAFT_FUNNEL_STAGES.includes(d.status) ? d.status : "project_basics";
    byStage[stage] += 1;
  }
  const total = drafts.length;
  const completed = byStage.submitted;
  const abandoned = total - completed;
  return {
    stages: DRAFT_FUNNEL_STAGES.map((stage) => ({ stage, count: byStage[stage] })),
    total,
    completed,
    abandoned,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function sumValues(obj) {
  return Object.values(obj).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}
