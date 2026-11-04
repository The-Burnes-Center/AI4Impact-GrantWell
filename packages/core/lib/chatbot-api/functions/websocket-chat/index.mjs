/**
 * This Lambda function handles WebSocket connections for the chatbot application.
 * It answers user messages from the active grant's extracted text (or its summary) with Claude.
 * The function supports connecting, disconnecting, and handling default and custom routes.
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import ClaudeModel from "./claudeSonnet.mjs";
import { buildChatRequest, getPromptText } from "./prompt.mjs";

const ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambdaClient = new LambdaClient({});

// SUPPORTED_STATES is injected as [{code,name}] (from config.states via supportedStatesEnv in lib/config/instance-config.ts). Parsed inline
// because this function does not attach the grantwell-shared Lambda layer.
const SUPPORTED_STATES = (() => {
  try {
    const parsed = JSON.parse(process.env.SUPPORTED_STATES || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.code === "string") : [];
  } catch {
    return [];
  }
})();
const SUPPORTED_STATE_CODES = new Set(SUPPORTED_STATES.map((s) => s.code));
const STATE_NAME_BY_CODE = Object.fromEntries(SUPPORTED_STATES.map((s) => [s.code, s.name]));

const CHAT_MESSAGES_PER_DAY = Number(process.env.CHAT_MESSAGES_PER_DAY) || 100;

const CAP_EXEMPT_ROLES = ["Admin", "PlatformAdmin", "Developer"];

/** Pinned by LOG_MARKERS.chatCapReached. */
const CHAT_CAP_MARKER = "Daily chat message limit reached";

const REFUSAL_MESSAGE = "I can't help with that request.";

const NO_GRANT_RECORD_MESSAGE =
  "We couldn't confirm your access to this grant. Please contact a platform administrator to request access.";

const CUT_OFF_NOTICE = "This answer was cut off. Ask me to continue.";

const ERROR_MESSAGE = "Something went wrong while answering. Try again in a moment.";

const RESET_SENTINEL = "<!RESET!>";

// The chat sends no tools, but text a model writes before a tool call is narration ("I'll search
// for..."). Holding back the start keeps it off screen; one that streamed already is reset instead.
const NARRATION_HOLD_CHARS = 300;

const CHAT_WORKER_MARKER = "grantwellChatWorker";

const ASYNC_PAYLOAD_LIMIT_BYTES = 256 * 1024;

const HISTORY_TURNS = 8;
const HISTORY_CHAR_BUDGET = 60000;

// Sonnet 5.5 reads 1M tokens; the largest grant is ~650 KB (~160k tokens). At ~4 characters a token
// this leaves room for the prompt and history; a bigger grant gets its summary instead.
const FULL_TEXT_MAX_CHARS = 750000 * 4;

const GRANT_UNAVAILABLE_MESSAGE =
  "I can't read this grant's text yet. It may still be processing, so please try again later.";

// Platform authority comes from the explicit PlatformAdmin role; this flag keeps pre-migration
// stateless admins working and must stay on until every pool is migrated.
const LEGACY_STATELESS_ADMIN_IS_PLATFORM =
  String(process.env.LEGACY_STATELESS_ADMIN_IS_PLATFORM ?? "true").toLowerCase() !== "false";

// WebSocket message events don't carry JWT claims (only $connect does), so
// we resolve state + roles via AdminGetUser per message. Latency is acceptable
// (~50-150ms) since chat responses already take seconds.
async function resolveUserAttributes(userId) {
  if (!userId || !process.env.USER_POOL_ID) return { state: "", roles: [] };
  try {
    const result = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: userId,
      })
    );
    const attrs = result.UserAttributes || [];
    const stateRaw = ((attrs.find(a => a.Name === "custom:state")?.Value) || "").trim().toUpperCase();
    const state = SUPPORTED_STATE_CODES.has(stateRaw) ? stateRaw : "";
    const roleRaw = (attrs.find(a => a.Name === "custom:role")?.Value) || "";
    let roles = [];
    if (roleRaw) {
      try {
        const parsed = JSON.parse(roleRaw);
        roles = Array.isArray(parsed) ? parsed.filter(r => typeof r === "string") : [roleRaw];
      } catch {
        roles = [roleRaw];
      }
    }
    return { state, roles };
  } catch (err) {
    console.warn(`Could not resolve attributes for user ${userId}:`, err.message);
    return { state: "", roles: [] };
  }
}

// Returns { scope, state } from the grant's metadata row, or null when there is no row or it can't be read.
async function readNofoScope(nofoName) {
  const tableName = process.env.NOFO_METADATA_TABLE_NAME;
  if (!tableName || !nofoName) return null;
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ nofo_name: nofoName }),
      })
    );
    if (!result.Item) return null;
    const row = unmarshall(result.Item);
    return {
      scope: typeof row.scope === "string" ? row.scope : null,
      state: typeof row.state === "string" ? row.state : null,
    };
  } catch (err) {
    console.warn(`Could not read scope/state for ${nofoName}:`, err.message);
    return null;
  }
}

// Returns null when allowed, else a payload for the client. `row` is readNofoScope's result (the
// grant's scope/state from DynamoDB), read alongside the user's attributes.
function checkPerNofoAccess(userRoles, userState, nofoName, row) {
  if (!nofoName) return null;

  const isDeveloper = userRoles.includes("Developer");
  const isAdmin = userRoles.includes("Admin");
  // Platform authority is the explicit PlatformAdmin role; a stateless Admin only counts
  // pre-migration (see LEGACY_STATELESS_ADMIN_IS_PLATFORM in grantwell-shared).
  const isPlatformAdmin =
    userRoles.includes("PlatformAdmin") ||
    (isAdmin && !userState && LEGACY_STATELESS_ADMIN_IS_PLATFORM);
  if (isDeveloper || isPlatformAdmin) return null;

  const nofoState = row?.state || null;
  const effectiveScope = row ? row.scope || "federal" : null;
  if (effectiveScope === "federal") return null;
  if (effectiveScope === "state" && nofoState && nofoState === userState) return null;

  const stateLabel = nofoState ? (STATE_NAME_BY_CODE[nofoState] || nofoState) : "another state";
  return {
    error: "ACCESS_DENIED_STATE",
    message: row
      ? `This grant is specific to ${stateLabel}. Please contact a platform administrator to request access.`
      : NO_GRANT_RECORD_MESSAGE,
    userState: userState || null,
    nofoState: nofoState || null,
    cta: { label: "Go back to home", target: "/home" },
  };
}

async function invokeSessionHandler(request) {
  const { Payload } = await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.SESSION_HANDLER,
    Payload: JSON.stringify({ body: JSON.stringify(request) }),
  }));
  try {
    return JSON.parse(Buffer.from(Payload).toString());
  } catch {
    return {};
  }
}

/**
 * The chat's newest saved turns, oldest first, and the supporting documents ticked for it
 * (`document_keys` on the header; undefined on chats saved before that existed). The greeting
 * (no user text) is left out. Within the character budget the newest turns win; a lone turn over
 * it is shortened. Fails open to no history.
 */
async function loadSavedChat(userId, sessionId) {
  const none = { turns: [], documentKeys: undefined };
  if (!sessionId || !process.env.SESSION_HANDLER) return none;
  try {
    const result = await invokeSessionHandler({
      operation: "get_session",
      user_id: userId,
      session_id: sessionId,
      limit: HISTORY_TURNS + 1,
    });
    if (result.statusCode !== 200) {
      console.warn("Could not load the chat history:", result.error || result.body || result.errorMessage);
      return none;
    }
    const header = JSON.parse(result.body || "{}");
    const documentKeys = Array.isArray(header.document_keys) ? header.document_keys : undefined;
    const entries = header.chat_history || [];
    const turns = entries
      .filter((e) => e && typeof e.user === "string" && e.user.trim() && typeof e.chatbot === "string" && e.chatbot.trim())
      .slice(-HISTORY_TURNS);
    const kept = [];
    let used = 0;
    for (const turn of turns.reverse()) {
      const size = turn.user.length + turn.chatbot.length;
      if (used + size <= HISTORY_CHAR_BUDGET) {
        kept.unshift({ user: turn.user, chatbot: turn.chatbot });
        used += size;
      } else {
        if (!kept.length) {
          const room = Math.max(0, HISTORY_CHAR_BUDGET - turn.user.length);
          kept.unshift({ user: turn.user.slice(0, HISTORY_CHAR_BUDGET), chatbot: turn.chatbot.slice(0, room) || "(answer omitted)" });
        }
        break;
      }
    }
    return { turns: kept, documentKeys };
  } catch (err) {
    console.warn("Could not load the chat history:", err.message);
    return none;
  }
}

async function readArtifact(bucket, key) {
  try {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await result.Body?.transformToString()) ?? "";
  } catch (err) {
    console.warn(`Could not read ${key}:`, err.name || err.message);
    return "";
  }
}

/**
 * What the model answers from: the grant's extracted text, else its summary.json (no or empty
 * raw-text.txt, a read error, or over the budget), else null.
 */
async function loadGrantSource(nofoName) {
  const bucket = process.env.ARTIFACTS_BUCKET;
  if (!bucket || !nofoName) return null;
  const textKey = `${nofoName}/raw-text.txt`;
  const text = await readArtifact(bucket, textKey);
  if (text.trim() && text.length <= FULL_TEXT_MAX_CHARS) {
    return { kind: "fullText", text, source: { title: "Grant document", uri: `s3://${bucket}/${textKey}` } };
  }
  if (text.trim()) console.warn(`${textKey} is ${text.length} chars, over the ${FULL_TEXT_MAX_CHARS}-char budget`);
  const summaryKey = `${nofoName}/summary.json`;
  const summary = await readArtifact(bucket, summaryKey);
  if (summary.trim()) {
    console.warn(`Answering ${nofoName} from its summary`);
    return { kind: "summary", text: summary, source: { title: "Grant summary", uri: `s3://${bucket}/${summaryKey}` } };
  }
  console.warn(`No raw-text.txt or summary.json for ${nofoName}`);
  return null;
}

async function listUploadedFileNames(userId, nofoName) {
  if (!userId || !process.env.USER_DOCUMENTS_BUCKET) return [];
  try {
    const userDocsPrefix = `${userId}/${nofoName}/`;
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: process.env.USER_DOCUMENTS_BUCKET,
      Prefix: userDocsPrefix,
      Delimiter: '/',
    }));
    return (listResult.Contents || [])
      .map(obj => obj.Key.replace(userDocsPrefix, ''))
      .filter(name => name && !name.endsWith('.metadata.json'));
  } catch (e) {
    console.warn('Could not list user documents:', e.message);
    return [];
  }
}

/**
 * Claude content blocks (document or text) for the user's supporting documents, placed after the
 * grant text by buildChatRequest. `documentKeys` is the session's `document_keys`, undefined for
 * chats saved before it existed.
 */
async function loadApplicantDocuments(userId, nofoName, documentKeys) {
  return [];
}

/**
 * Answers one chat message from the grant's text (or summary) and saves the turn.
 *
 * @param {string} id - The connection ID.
 * @param {object} requestJSON - The request JSON containing user data and message.
 */
const getUserResponse = async (id, requestJSON, authenticatedUserId) => {
  try {
    const data = requestJSON.data;
    let userMessage = data.userMessage;
    // The WebSocket Lambda authorizer authenticates the principal at $connect
    // and propagates the user's sub via authorizer context. Trust that value
    // rather than data.user_id from the message body, which a connected client
    // can spoof to access other users' sessions and documents.
    if (!authenticatedUserId) {
      throw new Error("Unauthenticated WebSocket message");
    }
    const userId = authenticatedUserId;
    const sessionId = data.session_id;
    const documentIdentifier = data.documentIdentifier;
    const grantName = (documentIdentifier || "").replace(/\/+$/, "");

    const [{ state: userState, roles: userRoles }, nofoRow] = await Promise.all([
      resolveUserAttributes(userId),
      grantName ? readNofoScope(grantName) : null,
    ]);

    const accessDenied = checkPerNofoAccess(userRoles, userState, grantName, nofoRow);
    if (accessDenied) {
      try {
        await wsConnectionClient.send(new PostToConnectionCommand({
          ConnectionId: id,
          Data: `<!ACCESS_DENIED!>${JSON.stringify(accessDenied)}`,
        }));
        await wsConnectionClient.send(new PostToConnectionCommand({
          ConnectionId: id,
          Data: "!<|EOF_STREAM|>!",
        }));
        await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
      } catch (e) {
        console.warn("Failed to send access-denied message:", e.message);
      }
      return;
    }

    const nofoName = grantName.split("/").pop() || grantName;
    // The cap is taken only once access is confirmed, alongside the loads the answer needs.
    const [withinCap, grantSource, savedChat, uploadedFileNames] = await Promise.all([
      userRoles.some((r) => CAP_EXEMPT_ROLES.includes(r)) ? true : takeDailyChatMessage(userId),
      loadGrantSource(nofoName),
      loadSavedChat(userId, sessionId),
      listUploadedFileNames(userId, nofoName),
    ]);

    if (!withinCap) {
      console.warn(`${CHAT_CAP_MARKER} for ${userId}`);
      try {
        await wsConnectionClient.send(new PostToConnectionCommand({
          ConnectionId: id,
          Data: `<!LIMIT!>You've reached today's limit of ${CHAT_MESSAGES_PER_DAY} chat messages. You can chat again tomorrow.`,
        }));
        await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
      } catch (e) {
        console.warn("Failed to send the daily limit message:", e.message);
      }
      return;
    }

    const post = async (data) => {
      try {
        await wsConnectionClient.send(new PostToConnectionCommand({ ConnectionId: id, Data: data }));
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    };

    let modelResponse = "";
    let sources = [];
    if (!grantSource) {
      modelResponse = GRANT_UNAVAILABLE_MESSAGE;
      await post(modelResponse);
    } else {
      const applicantDocuments = await loadApplicantDocuments(userId, nofoName, savedChat.documentKeys);

      let uploadedFilesList = "";
      if (uploadedFileNames.length > 0) {
        uploadedFilesList = `\n\nThe user has uploaded the following documents for this grant:\n${uploadedFileNames.map((f) => `- ${f}`).join("\n")}\nTheir contents are not included in this chat; do not guess what they say.\n`;
      }

      const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });
      const { system, messages } = buildChatRequest({
        instructions: getPromptText(userState, { source: grantSource.kind }),
        grantText: grantSource.text,
        applicantDocuments,
        context: `Active grant (documentIdentifier): ${documentIdentifier}${uploadedFilesList}\n\nToday's date is ${today} (US Eastern). Use it when a question turns on whether a deadline has passed or how much time is left.`,
        turns: savedChat.turns,
        question: userMessage,
      });

      const claude = new ClaudeModel();
      let refusalCategory = null;
      try {
        const stream = await claude.getStreamedResponse(system, messages);
        let callText = "";
        let streamed = false;
        const { stopReason, stopDetails } = await claude.readStream(stream, async (text) => {
          callText = callText.concat(text);
          if (streamed) {
            await post(text);
          } else if (callText.length >= NARRATION_HOLD_CHARS) {
            streamed = true;
            await post(callText);
          }
        });

        if (stopReason === "tool_use") {
          if (streamed) await post(RESET_SENTINEL);
        } else {
          if (!streamed && callText) await post(callText);
          modelResponse = callText;
          if (stopReason === "refusal") {
            refusalCategory = stopDetails?.category ?? "none";
          } else if (stopReason === "max_tokens") {
            const notice = modelResponse ? `\n\n${CUT_OFF_NOTICE}` : CUT_OFF_NOTICE;
            modelResponse = modelResponse.concat(notice);
            await post(notice);
          }
        }
      } catch (error) {
        console.error("Stream processing error:", error);
        await post(`<!ERROR!>: ${ERROR_MESSAGE}`);
        return;
      }

      if (refusalCategory) {
        console.warn(`Model refused the request (category: ${refusalCategory})`);
        try {
          await wsConnectionClient.send(new PostToConnectionCommand({
            ConnectionId: id,
            Data: modelResponse ? `\n\n${REFUSAL_MESSAGE}` : REFUSAL_MESSAGE,
          }));
          await wsConnectionClient.send(new PostToConnectionCommand({ ConnectionId: id, Data: "!<|EOF_STREAM|>!" }));
          await wsConnectionClient.send(new PostToConnectionCommand({ ConnectionId: id, Data: "[]" }));
          await wsConnectionClient.send(new DeleteConnectionCommand({ ConnectionId: id }));
        } catch (e) {
          console.error("Error sending refusal message:", e);
        }
        return;
      }

      if (!modelResponse) {
        console.error("Stream processing error:", new Error("The model returned no answer text"));
        await post(`<!ERROR!>: ${ERROR_MESSAGE}`);
        return;
      }
      sources = [grantSource.source];
    }

    let command;
    let links = JSON.stringify(sources);
    try {
      let eofParams = {
        ConnectionId: id,
        Data: "!<|EOF_STREAM|>!"
      };
      command = new PostToConnectionCommand(eofParams);
      await wsConnectionClient.send(command);

      let responseParams = {
        ConnectionId: id,
        Data: links
      };
      command = new PostToConnectionCommand(responseParams);
      await wsConnectionClient.send(command);
    } catch (e) {
      console.error("Error sending EOF_STREAM and sources:", e);
    }

    const saved = await invokeSessionHandler({
      operation: "update_session",
      user_id: userId,
      session_id: sessionId,
      new_chat_entry: [{ user: userMessage, chatbot: modelResponse, metadata: links }],
      title: `Chat about ${documentIdentifier}`,
      document_identifier: documentIdentifier,
    });
    if (saved.statusCode !== 200) {
      console.error("Could not save the chat turn:", saved.error || saved.body || saved.errorMessage);
    }

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
    let responseParams = {
      ConnectionId: id,
      Data: `<!ERROR!>: ${ERROR_MESSAGE}`
    };
    let command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);
  }
};

/**
 * Counts one message against the user's cap for the current UTC day. False once the cap is
 * reached; the condition makes concurrent messages unable to pass it. Fails open on any other error.
 */
async function takeDailyChatMessage(userId) {
  const tableName = process.env.DAILY_USAGE_TABLE_NAME;
  if (!tableName) return true;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const expires = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2) / 1000);
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { pk: { S: `${userId}#${day}` } },
        UpdateExpression: "ADD #count :one SET #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :cap",
        ExpressionAttributeNames: { "#count": "chat_messages", "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":cap": { N: String(CHAT_MESSAGES_PER_DAY) },
          ":ttl": { N: String(expires) },
        },
      })
    );
    return true;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return false;
    console.warn(`Could not count the chat message for ${userId}:`, err.message);
    return true;
  }
}

/** True once an async copy of this function has the event; false means answer inline. */
async function handOffToWorker(event) {
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) return false;
  const payload = JSON.stringify({ ...event, [CHAT_WORKER_MARKER]: true });
  if (Buffer.byteLength(payload) > ASYNC_PAYLOAD_LIMIT_BYTES) {
    console.warn(`Chat request is ${Buffer.byteLength(payload)} bytes, over the async limit; answering inline`);
    return false;
  }
  try {
    await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, InvocationType: "Event", Payload: payload }));
    return true;
  } catch (err) {
    console.error("Could not hand the chat request to a worker; answering inline:", err.message);
    return false;
  }
}

/**
 * Main Lambda handler function for WebSocket events.
 * Handles connecting, disconnecting, and custom routes.
 * 
 * @param {object} event - The event object containing request data.
 * @returns {object} - A response object with a status code and optional body.
 */
export const handler = async (event) => {
  if (event.requestContext) {
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body = {};
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      console.error("Failed to parse JSON:", err);
    }

    switch (routeKey) {
      case '$connect':
        return { statusCode: 200 };
      case '$disconnect':
        return { statusCode: 200 };
      case '$default':
        return { action: 'Default Response Triggered' };
      case "getChatbotResponse": {
        const authCtx = event.requestContext?.authorizer || {};
        const authenticatedUserId = authCtx.userId || authCtx.principalId;
        if (!authenticatedUserId) {
          return {
            statusCode: 401,
            body: JSON.stringify({ error: "Unauthorized: missing principal" }),
          };
        }
        // API Gateway gives up on the integration after 29 s and pushes its own timeout frame down the
        // socket, so the answer runs in a second, async invocation. Only a direct invoke can set the
        // marker: clients control the body, never the top-level event.
        if (event[CHAT_WORKER_MARKER] !== true && (await handOffToWorker(event))) {
          return { statusCode: 200 };
        }
        await getUserResponse(connectionId, body, authenticatedUserId);
        return { statusCode: 200 };
      }
      default:
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: "The requested route is not recognized."
          })
        };
    }
  }
  return {
    statusCode: 200,
  };
};
