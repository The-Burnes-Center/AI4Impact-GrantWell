/**
 * What happened to the applications users wrote: they record an outcome per application, are
 * reminded once the grant's deadline has passed, and admins read every outcome in their scope.
 *
 * Env: OUTCOME_TABLE_NAME, DRAFT_TABLE_NAME, NOFO_METADATA_TABLE_NAME, ANALYTICS_TABLE_NAME,
 * USER_POOL_ID, SUPPORTED_STATES
 */

import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  getAuthenticatedUserId,
  getSupportedStateCodes,
  jsonResponse,
  requireAdmin,
  resolveCallerScope,
} from "grantwell-shared";

const region = process.env.AWS_REGION || "us-east-1";
const dynamo = new DynamoDBClient({ region });
const cognito = new CognitoIdentityProviderClient({ region });

const OUTCOME_TABLE = process.env.OUTCOME_TABLE_NAME;
const DRAFT_TABLE = process.env.DRAFT_TABLE_NAME;
const NOFO_TABLE = process.env.NOFO_METADATA_TABLE_NAME;
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE_NAME;
const USER_POOL_ID = process.env.USER_POOL_ID;

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_EVERY_MS = 60 * DAY_MS;
export const ROLLING_FIRST_REMINDER_MS = 90 * DAY_MS;
const MAX_AMOUNT = 1_000_000_000_000;
const MAX_SNOOZE_IDS = 100;
const BATCH_GET_SIZE = 100;
const MAX_LIST_PAGES = 50;
/** Holds when this deployment started reminding; applications last edited before then never prompt. */
export const REMINDERS_FROM_KEY = { user_id: "#meta", session_id: "reminders_from" };

/** Which dates and amounts each status needs. "submitted" waits for a decision, so it keeps reminding. */
export const STATUS_FIELDS = {
  submitted: ["submittedDate"],
  awarded: ["decisionDate", "amountAwarded"],
  not_awarded: ["decisionDate"],
  withdrawn: [],
  not_submitted: [],
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") return jsonResponse(200, {});
  try {
    const route = event.routeKey || "";
    if (route === "GET /admin/application-outcomes") return await adminList(event);

    const userId = getAuthenticatedUserId(event);
    if (!userId) return jsonResponse(401, { message: "Authenticated user is missing" });

    if (route === "GET /application-outcomes") {
      return jsonResponse(200, { outcomes: (await userOutcomes(userId)).filter((o) => o.status).map(toClient) });
    }
    if (route === "GET /application-outcomes/due") {
      return jsonResponse(200, { due: await dueApplications(userId, Date.now()) });
    }
    if (route === "POST /application-outcomes/snooze") {
      return await snooze(userId, parseBody(event.body));
    }
    if (route === "PUT /application-outcomes/{sessionId}") {
      const sessionId = decodeURIComponent(event.pathParameters?.sessionId || "");
      return await recordOutcome(userId, callerState(event), sessionId, parseBody(event.body));
    }
    return jsonResponse(404, { message: "Not found" });
  } catch (error) {
    console.error("Application outcomes error:", error);
    return jsonResponse(error?.statusCode || 500, { message: error?.statusCode ? error.message : "Request failed" });
  }
};

/** Grant folder names end in "/", and application titles made from them inherit it. */
const displayName = (text) => String(text || "").replace(/\/+$/, "");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw badRequest("Body is not JSON");
  }
}

// Single-state deployments give every user the state at sign-in, so the claim is enough there too.
function callerState(event) {
  const state = String(event.requestContext?.authorizer?.jwt?.claims?.["custom:state"] || "").trim().toUpperCase();
  return getSupportedStateCodes().has(state) ? state : "";
}

async function queryAll(input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await dynamo.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items || []).map((i) => unmarshall(i)));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function userOutcomes(userId) {
  return queryAll({
    TableName: OUTCOME_TABLE,
    KeyConditionExpression: "user_id = :u",
    ExpressionAttributeValues: marshall({ ":u": userId }),
  });
}

function toClient(row) {
  return {
    sessionId: row.session_id,
    status: row.status,
    submittedDate: row.submitted_date ?? null,
    decisionDate: row.decision_date ?? null,
    amountAwarded: row.amount_awarded ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// --- Recording an outcome -------------------------------------------------------------------

function isPastOrToday(isoDate, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  // A day of slack: "today" in any US time zone can still be tomorrow in UTC.
  return Number.isFinite(t) && t <= now + DAY_MS;
}

export function validateOutcome(body, now = Date.now()) {
  const status = String(body.status || "");
  const needed = STATUS_FIELDS[status];
  if (!needed) throw badRequest(`status must be one of ${Object.keys(STATUS_FIELDS).join(", ")}`);
  const outcome = { status };
  for (const [field, label] of [["submittedDate", "Date submitted"], ["decisionDate", "Decision date"]]) {
    if (!needed.includes(field)) continue;
    const value = String(body[field] || "");
    if (!isPastOrToday(value, now)) throw badRequest(`${label} must be a date (YYYY-MM-DD) no later than today`);
    outcome[field] = value;
  }
  if (needed.includes("amountAwarded")) {
    const amount = body.amountAwarded;
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
      throw badRequest("Amount awarded must be a whole number of dollars");
    }
    outcome.amountAwarded = amount;
  }
  return outcome;
}

async function getItem(TableName, key, ProjectionExpression, ExpressionAttributeNames) {
  const res = await dynamo.send(
    new GetItemCommand({ TableName, Key: marshall(key), ProjectionExpression, ExpressionAttributeNames })
  );
  return res.Item ? unmarshall(res.Item) : null;
}

async function recordOutcome(userId, state, sessionId, body) {
  if (!sessionId) throw badRequest("sessionId is required");
  const outcome = validateOutcome(body);
  const draft = await getItem(
    DRAFT_TABLE,
    { user_id: userId, session_id: sessionId },
    "title, document_identifier, project_basics"
  );
  if (!draft) return jsonResponse(404, { message: "Application not found" });
  const [existing, profile] = await Promise.all([
    getItem(OUTCOME_TABLE, { user_id: userId, session_id: sessionId }, "created_at"),
    getItem(ANALYTICS_TABLE, { pk: `USER#${userId}`, sk: "PROFILE" }, "organization, #rg", { "#rg": "region" }),
  ]);
  const now = new Date();
  const row = {
    user_id: userId,
    session_id: sessionId,
    status: outcome.status,
    ...(outcome.submittedDate && { submitted_date: outcome.submittedDate }),
    ...(outcome.decisionDate && { decision_date: outcome.decisionDate }),
    ...(outcome.amountAwarded !== undefined && { amount_awarded: outcome.amountAwarded }),
    ...(outcome.status === "submitted" && { next_reminder_at: new Date(now.getTime() + REMIND_EVERY_MS).toISOString() }),
    // Snapshots, so the row still reads right after the application or account is gone.
    title: displayName(draft.title),
    grant: displayName(draft.document_identifier),
    requested_amount: String(draft.project_basics?.requestedAmount || ""),
    organization: String(profile?.organization || ""),
    region: String(profile?.region || ""),
    state,
    created_at: existing?.created_at || now.toISOString(),
    updated_at: now.toISOString(),
  };
  await dynamo.send(new PutItemCommand({ TableName: OUTCOME_TABLE, Item: marshall(row) }));
  return jsonResponse(200, toClient(row));
}

async function snooze(userId, body) {
  const ids = Array.isArray(body.sessionIds) ? [...new Set(body.sessionIds.map(String).filter(Boolean))] : [];
  if (ids.length === 0 || ids.length > MAX_SNOOZE_IDS) throw badRequest(`sessionIds must list 1 to ${MAX_SNOOZE_IDS} applications`);
  const until = new Date(Date.now() + REMIND_EVERY_MS).toISOString();
  for (const sessionId of ids) {
    await dynamo.send(
      new UpdateItemCommand({
        TableName: OUTCOME_TABLE,
        Key: marshall({ user_id: userId, session_id: sessionId }),
        UpdateExpression: "SET next_reminder_at = :n",
        ExpressionAttributeValues: marshall({ ":n": until }),
      })
    );
  }
  return jsonResponse(200, { snoozedUntil: until });
}

// --- Reminders ------------------------------------------------------------------------------

let remindersFrom;

/** The first call after the feature deploys stamps the start; every later call reads it back. */
async function remindersFromMs() {
  if (remindersFrom !== undefined) return remindersFrom;
  const now = new Date().toISOString();
  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: OUTCOME_TABLE,
        Item: marshall({ ...REMINDERS_FROM_KEY, started_at: now }),
        ConditionExpression: "attribute_not_exists(user_id)",
      })
    );
    remindersFrom = Date.parse(now);
  } catch (error) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    const row = await getItem(OUTCOME_TABLE, REMINDERS_FROM_KEY, "started_at");
    remindersFrom = Date.parse(row?.started_at);
  }
  return remindersFrom;
}

function hasProjectBasics(draft) {
  const basics = draft.project_basics;
  return Boolean(basics && typeof basics === "object" && Object.values(basics).some((v) => String(v ?? "").trim()));
}

/** End of the deadline day in UTC, as the auto-archiver reads it; null for rolling or unknown deadlines. */
export function deadlineMs(nofo) {
  if (!nofo || String(nofo.is_rolling) === "true" || !nofo.expiration_date) return null;
  const raw = String(nofo.expiration_date);
  const t = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T23:59:59Z`) : Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/**
 * When an application is next due for the reminder, or null when it never is again: the deadline
 * has to pass first (rolling grants: 90 days after the last edit), and a snooze or a "submitted"
 * answer pushes it out. Any other outcome is final.
 */
export function dueAtMs(draft, nofo, outcome) {
  if (outcome?.status && outcome.status !== "submitted") return null;
  const first = deadlineMs(nofo) ?? Date.parse(draft.last_modified) + ROLLING_FIRST_REMINDER_MS;
  if (!Number.isFinite(first)) return null;
  const next = outcome?.next_reminder_at ? Date.parse(outcome.next_reminder_at) : NaN;
  return Number.isFinite(next) ? Math.max(first, next) : first;
}

async function batchGetNofos(names) {
  const byName = new Map();
  for (let i = 0; i < names.length; i += BATCH_GET_SIZE) {
    let keys = names.slice(i, i + BATCH_GET_SIZE).map((n) => marshall({ nofo_name: n }));
    for (let attempt = 0; keys.length && attempt < 5; attempt += 1) {
      const res = await dynamo.send(
        new BatchGetItemCommand({
          RequestItems: {
            [NOFO_TABLE]: { Keys: keys, ProjectionExpression: "nofo_name, expiration_date, is_rolling" },
          },
        })
      );
      for (const raw of res.Responses?.[NOFO_TABLE] || []) {
        const item = unmarshall(raw);
        byName.set(item.nofo_name, item);
      }
      keys = res.UnprocessedKeys?.[NOFO_TABLE]?.Keys || [];
    }
  }
  return byName;
}

async function dueApplications(userId, now) {
  const [drafts, outcomes] = await Promise.all([
    queryAll({
      TableName: DRAFT_TABLE,
      KeyConditionExpression: "user_id = :u",
      ExpressionAttributeValues: marshall({ ":u": userId }),
      ProjectionExpression: "session_id, title, document_identifier, project_basics, last_modified",
    }),
    userOutcomes(userId),
  ]);
  const from = await remindersFromMs();
  const withBasics = drafts.filter((d) => hasProjectBasics(d) && Date.parse(d.last_modified) >= from);
  const outcomeBySession = new Map(outcomes.map((o) => [o.session_id, o]));
  const nofos = await batchGetNofos([...new Set(withBasics.map((d) => d.document_identifier).filter(Boolean))]);
  return withBasics
    .map((draft) => {
      const nofo = nofos.get(draft.document_identifier);
      const outcome = outcomeBySession.get(draft.session_id);
      return { draft, nofo, outcome, dueAt: dueAtMs(draft, nofo, outcome) };
    })
    .filter(({ dueAt }) => dueAt !== null && dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map(({ draft, nofo, outcome }) => ({
      sessionId: draft.session_id,
      title: displayName(draft.title),
      grant: displayName(draft.document_identifier),
      deadline: deadlineMs(nofo) === null ? null : String(nofo.expiration_date),
      status: outcome?.status ?? null,
      submittedDate: outcome?.submitted_date ?? null,
    }));
}

// --- Admin ----------------------------------------------------------------------------------

async function scanOutcomes() {
  const rows = [];
  let ExclusiveStartKey;
  do {
    const page = await dynamo.send(new ScanCommand({ TableName: OUTCOME_TABLE, ExclusiveStartKey }));
    rows.push(...(page.Items || []).map((i) => unmarshall(i)));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return rows.filter((r) => r.status);
}

async function emailsBySub() {
  const emails = new Map();
  let PaginationToken;
  let pages = 0;
  do {
    const page = await cognito.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60, PaginationToken }));
    for (const user of page.Users || []) {
      const attrs = Object.fromEntries((user.Attributes || []).map((a) => [a.Name, a.Value || ""]));
      if (attrs.sub) emails.set(attrs.sub, String(attrs.email || "").toLowerCase());
    }
    PaginationToken = page.PaginationToken;
    pages += 1;
  } while (PaginationToken && pages < MAX_LIST_PAGES);
  if (PaginationToken) console.warn(`ListUsers hit the ${MAX_LIST_PAGES}-page cap; some emails are blank.`);
  return emails;
}

async function adminList(event) {
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;
  const scope = resolveCallerScope(event);
  if (scope.role === "unscopedAdmin") return jsonResponse(403, { error: "Forbidden: no state assigned" });
  const requested = String(event.queryStringParameters?.state || "").trim().toUpperCase();
  const stateFilter =
    scope.role === "stateAdmin" ? scope.state : getSupportedStateCodes().has(requested) ? requested : null;

  const [rows, emails] = await Promise.all([scanOutcomes(), emailsBySub()]);
  const outcomes = rows
    .filter((r) => !stateFilter || r.state === stateFilter)
    .map((r) => ({
      email: r.user_id.startsWith("deleted#") ? "" : emails.get(r.user_id) || "",
      deleted: r.user_id.startsWith("deleted#"),
      organization: r.organization || "",
      region: r.region || "",
      state: r.state || "",
      grant: displayName(r.grant),
      title: displayName(r.title),
      status: r.status,
      requestedAmount: r.requested_amount || "",
      amountAwarded: r.amount_awarded ?? null,
      submittedDate: r.submitted_date ?? null,
      decisionDate: r.decision_date ?? null,
      updatedAt: r.updated_at ?? null,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return jsonResponse(200, { outcomes, generatedAt: new Date().toISOString() });
}
