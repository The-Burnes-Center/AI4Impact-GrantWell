/**
 * CRUD for a state's overlay row on a NOFO, keyed (nofo_name, state). One row carries two
 * independent pieces of overlay data:
 *
 *   note            — guidance shown to that state's users on a *federal* NOFO's public page
 *                     (merged in by retrieveNOFOSummary); the shared federal record is never mutated.
 *   customQuestions — admin-authored questionnaire questions layered onto a *state* NOFO's writer
 *                     (merged in by retrieveNOFOQuestions). Used when the NOFO document doesn't spell
 *                     out the questions the agency wants applicants to answer.
 *
 * Auth differs by field because the two serve opposite scopes:
 *   - note: overlays a federal NOFO. `state` is stamped from the caller's JWT (state admins write
 *     only their own); developers/stateless admins may target any state via `?state=`.
 *   - customQuestions: overlays a *state* NOFO, so `state` is derived from the NOFO itself and edit
 *     authority is enforced with assertCanEditNofo — dev/regularAdmin edit any, a state admin only
 *     its own state's NOFO.
 *
 *   GET    /nofo-overlay?nofoName=...                    -> the relevant overlay row
 *   PUT    /nofo-overlay  { nofoName, note }             -> upsert note (empty clears it)
 *   PUT    /nofo-overlay  { nofoName, customQuestions }  -> upsert custom questions (state NOFOs)
 *   DELETE /nofo-overlay?nofoName=...                    -> remove the caller's-state overlay row
 */

import {
  DynamoDBClient, GetItemCommand, DeleteItemCommand, UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "node:crypto";
import {
  requireAdmin, resolveCallerScope, readNofoScope, assertCanEditNofo,
  jsonResponse, sanitizeContentHtml,
} from "grantwell-shared";

const dynamoClient = new DynamoDBClient();
const scopeDeps = { client: dynamoClient, GetItemCommand, marshall, unmarshall };

const TABLE_NAME = process.env.NOFO_STATE_OVERLAY_TABLE_NAME;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;

// Cap note length so an overlay can't bloat the summary payload.
const MAX_NOTE_LENGTH = 8000;

// Caps on custom questions so the overlay row stays well under DynamoDB's item limit and the
// questionnaire stays manageable.
const MAX_CUSTOM_QUESTIONS = 25;
const MAX_QUESTION_LENGTH = 500;
const MAX_HELP_TEXT_LENGTH = 300;

export const handler = async (event) => {
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  if (!TABLE_NAME) return jsonResponse(500, { message: "Overlay storage is not configured" });

  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const callerScope = resolveCallerScope(event);

  try {
    const nofoName = readNofoName(event, method);
    if (!nofoName) return jsonResponse(400, { message: "Missing 'nofoName'" });

    const { scope, state: nofoState } = await readNofoScope(scopeDeps, METADATA_TABLE, nofoName);

    // A PUT carrying customQuestions targets a *state* NOFO's row: the state is the NOFO's own, and
    // edit authority is enforced with assertCanEditNofo (dev/regularAdmin any; state admin own only).
    const body = method === "PUT" ? parseBody(event.body) : {};
    if (method === "PUT" && Array.isArray(body.customQuestions)) {
      return await handleCustomQuestionsPut(nofoName, scope, nofoState, callerScope, body);
    }

    // A GET on a state NOFO is the authoring UI loading its custom questions. Its row is keyed by
    // the NOFO's own state (not the caller's), so resolve the target from the NOFO and authorize
    // with assertCanEditNofo — otherwise the note path below would 400 (federal-only / no ?state=).
    if (method === "GET" && scope === "state" && nofoState) {
      assertCanEditNofo(callerScope, "state", nofoState);
      return jsonResponse(200, await getOverlay(nofoName, nofoState));
    }

    // note-overlay path: applies only to federal NOFOs. `state` is the caller's (or ?state= for
    // developers/stateless admins), never the NOFO's.
    const targetState = resolveTargetState(event, callerScope);
    if (!targetState) {
      return jsonResponse(400, {
        message: "A target state is required (state admins use their assigned state).",
      });
    }
    if (scope && scope !== "federal") {
      return jsonResponse(400, { message: "Guidance overlays apply only to federal NOFOs." });
    }

    if (method === "GET") {
      return jsonResponse(200, await getOverlay(nofoName, targetState));
    }
    if (method === "PUT") {
      const note = sanitizeContentHtml(String(body.note ?? "")).trim();
      if (note.length > MAX_NOTE_LENGTH) {
        return jsonResponse(400, { message: `Note exceeds ${MAX_NOTE_LENGTH} characters.` });
      }
      if (!note) {
        await clearNote(nofoName, targetState);
        return jsonResponse(200, await getOverlay(nofoName, targetState));
      }
      await putNote(nofoName, targetState, note, callerScope);
      return jsonResponse(200, await getOverlay(nofoName, targetState));
    }
    if (method === "DELETE") {
      await deleteOverlay(nofoName, targetState);
      return jsonResponse(200, { nofoName, state: targetState, note: "", customQuestions: [] });
    }
    return jsonResponse(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("State overlay error:", error);
    return jsonResponse(error?.statusCode || 500, { message: error?.message || "Overlay request failed" });
  }
};

async function handleCustomQuestionsPut(nofoName, scope, nofoState, callerScope, body) {
  // Custom questions layer onto a state NOFO; a federal NOFO gets its questions from its document.
  if (scope !== "state" || !nofoState) {
    return jsonResponse(400, { message: "Custom questions apply only to state NOFOs." });
  }
  // Throws a 403-bearing error (caught by the handler) when the caller can't edit this state's NOFO.
  assertCanEditNofo(callerScope, "state", nofoState);

  const customQuestions = normalizeCustomQuestions(body.customQuestions);
  if (customQuestions.length > MAX_CUSTOM_QUESTIONS) {
    return jsonResponse(400, { message: `At most ${MAX_CUSTOM_QUESTIONS} custom questions are allowed.` });
  }
  await putCustomQuestions(nofoName, nofoState, customQuestions, callerScope);
  return jsonResponse(200, await getOverlay(nofoName, nofoState));
}

/**
 * Validate and normalize admin-supplied custom questions. Questions are plain text (rendered as
 * text nodes downstream), so they are trimmed and length-capped but NOT run through the HTML
 * sanitizer — that strips <word> substrings, which are legitimate in question prompts. Ids are
 * always server-controlled: an incoming id is kept only if it already looks like ours, otherwise a
 * fresh `custom_<uuid>` is minted, so a client can never shadow a parsed question's key.
 */
function normalizeCustomQuestions(input) {
  const seenIds = new Set();
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const question = String(raw.question ?? "").trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question) continue;
    let id = typeof raw.id === "string" && /^custom_/.test(raw.id) ? raw.id : `custom_${randomUUID()}`;
    while (seenIds.has(id)) id = `custom_${randomUUID()}`;
    seenIds.add(id);
    const helpText = String(raw.helpText ?? "").trim().slice(0, MAX_HELP_TEXT_LENGTH);
    out.push(helpText ? { id, question, helpText } : { id, question });
  }
  return out;
}

function readNofoName(event, method) {
  if (method === "PUT") return (parseBody(event.body).nofoName || "").trim();
  return (event.queryStringParameters?.nofoName || "").trim();
}

function resolveTargetState(event, callerScope) {
  if (callerScope.role === "stateAdmin") return callerScope.state;
  // developer / regularAdmin may target any state explicitly.
  const requested = String(event.queryStringParameters?.state || "").trim().toUpperCase();
  return requested || "";
}

function parseBody(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

async function getOverlay(nofoName, state) {
  const result = await dynamoClient.send(
    new GetItemCommand({ TableName: TABLE_NAME, Key: marshall({ nofo_name: nofoName, state }) })
  );
  if (!result.Item) return { nofoName, state, note: "", customQuestions: [], updatedAt: null };
  const row = unmarshall(result.Item);
  return {
    nofoName,
    state,
    note: typeof row.note === "string" ? row.note : "",
    customQuestions: Array.isArray(row.customQuestions) ? row.customQuestions : [],
    updatedAt: row.updated_at || null,
  };
}

// note and customQuestions are written independently (SET only the one field this request owns) so
// the guidance-note editor and the custom-questions editor never clobber each other's data.
async function putNote(nofoName, state, note, callerScope) {
  await updateOverlayField(nofoName, state, "note", note, callerScope);
}

async function putCustomQuestions(nofoName, state, customQuestions, callerScope) {
  await updateOverlayField(nofoName, state, "customQuestions", customQuestions, callerScope);
}

async function updateOverlayField(nofoName, state, field, value, callerScope) {
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ nofo_name: nofoName, state }),
      UpdateExpression: "SET #f = :v, updated_at = :at, updated_by = :by",
      ExpressionAttributeNames: { "#f": field },
      ExpressionAttributeValues: marshall({
        ":v": value,
        ":at": new Date().toISOString(),
        ":by": callerScope.role,
      }),
    })
  );
}

// Clearing the note removes just that attribute; the row (and any custom questions) survives, and is
// removed entirely only once nothing is left on it.
async function clearNote(nofoName, state) {
  const remaining = await getOverlay(nofoName, state);
  if (remaining.customQuestions.length === 0) {
    await deleteOverlay(nofoName, state);
    return;
  }
  await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ nofo_name: nofoName, state }),
      UpdateExpression: "REMOVE note",
    })
  );
}

async function deleteOverlay(nofoName, state) {
  await dynamoClient.send(
    new DeleteItemCommand({ TableName: TABLE_NAME, Key: marshall({ nofo_name: nofoName, state }) })
  );
}
