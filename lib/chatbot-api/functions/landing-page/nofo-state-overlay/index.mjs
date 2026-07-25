/**
 * CRUD for a state's guidance overlay on a federal NOFO.
 *
 * A state admin attaches a note shown only to their state's users on the public NOFO page
 * (merged in by retrieveNOFOSummary); the shared federal record is never mutated. The overlay's
 * `state` is always stamped from the caller's JWT — never trusted from the request body — so a
 * state admin can only write their own state's overlay. Developers/stateless admins may target
 * any state via `?state=`. Overlays only make sense on federal NOFOs.
 *
 *   GET    /nofo-overlay?nofoName=...        -> the caller's-state overlay for that NOFO
 *   PUT    /nofo-overlay  { nofoName, note } -> upsert; empty note deletes
 *   DELETE /nofo-overlay?nofoName=...        -> remove the caller's-state overlay
 */

import {
  DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  requireAdmin, resolveCallerScope, readNofoScope, jsonResponse, sanitizeContentHtml,
} from "grantwell-shared";

const dynamoClient = new DynamoDBClient();
const scopeDeps = { client: dynamoClient, GetItemCommand, marshall, unmarshall };

const TABLE_NAME = process.env.NOFO_STATE_OVERLAY_TABLE_NAME;
const METADATA_TABLE = process.env.NOFO_METADATA_TABLE_NAME;

// Cap note length so an overlay can't bloat the summary payload.
const MAX_NOTE_LENGTH = 8000;

export const handler = async (event) => {
  const forbidden = requireAdmin(event);
  if (forbidden) return forbidden;

  if (!TABLE_NAME) return jsonResponse(500, { message: "Overlay storage is not configured" });

  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const callerScope = resolveCallerScope(event);

  try {
    const nofoName = readNofoName(event, method);
    if (!nofoName) return jsonResponse(400, { message: "Missing 'nofoName'" });

    // Which state's overlay this call targets. State admins are locked to their own; a
    // developer/regular admin may pass ?state= to manage a specific state's overlay.
    const targetState = resolveTargetState(event, callerScope);
    if (!targetState) {
      return jsonResponse(400, {
        message: "A target state is required (state admins use their assigned state).",
      });
    }

    // Overlays apply only to federal NOFOs; a state NOFO is already fully owned/editable.
    const { scope } = await readNofoScope(scopeDeps, METADATA_TABLE, nofoName);
    if (scope && scope !== "federal") {
      return jsonResponse(400, { message: "Overlays apply only to federal NOFOs." });
    }

    if (method === "GET") {
      return jsonResponse(200, await getOverlay(nofoName, targetState));
    }
    if (method === "PUT") {
      const body = parseBody(event.body);
      const note = sanitizeContentHtml(String(body.note ?? "")).trim();
      if (note.length > MAX_NOTE_LENGTH) {
        return jsonResponse(400, { message: `Note exceeds ${MAX_NOTE_LENGTH} characters.` });
      }
      if (!note) {
        await deleteOverlay(nofoName, targetState);
        return jsonResponse(200, { nofoName, state: targetState, note: "" });
      }
      await putOverlay(nofoName, targetState, note, callerScope);
      return jsonResponse(200, await getOverlay(nofoName, targetState));
    }
    if (method === "DELETE") {
      await deleteOverlay(nofoName, targetState);
      return jsonResponse(200, { nofoName, state: targetState, note: "" });
    }
    return jsonResponse(405, { message: "Method not allowed" });
  } catch (error) {
    console.error("State overlay error:", error);
    return jsonResponse(error?.statusCode || 500, { message: error?.message || "Overlay request failed" });
  }
};

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
  if (!result.Item) return { nofoName, state, note: "", updatedAt: null };
  const row = unmarshall(result.Item);
  return {
    nofoName,
    state,
    note: typeof row.note === "string" ? row.note : "",
    updatedAt: row.updated_at || null,
  };
}

async function putOverlay(nofoName, state, note, callerScope) {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        nofo_name: nofoName,
        state,
        note,
        updated_at: new Date().toISOString(),
        updated_by: callerScope.role,
      }),
    })
  );
}

async function deleteOverlay(nofoName, state) {
  await dynamoClient.send(
    new DeleteItemCommand({ TableName: TABLE_NAME, Key: marshall({ nofo_name: nofoName, state }) })
  );
}
