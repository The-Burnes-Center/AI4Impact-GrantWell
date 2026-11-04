/**
 * This Lambda function handles WebSocket connections for the chatbot application.
 * It processes user messages, retrieves relevant documents from the Bedrock Knowledge Base, and generates responses using AI models.
 * The function supports connecting, disconnecting, and handling default and custom routes.
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import ClaudeModel from "./claudeSonnet.mjs";
import { buildChatRequest, getPromptText, retrievedPassages } from "./prompt.mjs";

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

const NOFO_STATE_FILTER_ENABLED = process.env.NOFO_STATE_FILTER_ENABLED === "true";

const CHAT_MESSAGES_PER_DAY = Number(process.env.CHAT_MESSAGES_PER_DAY) || 100;

const CAP_EXEMPT_ROLES = ["Admin", "PlatformAdmin", "Developer"];

/** Pinned by LOG_MARKERS.chatCapReached. */
const CHAT_CAP_MARKER = "Daily chat message limit reached";

const MAX_MODEL_CALLS = 5;

const REFUSAL_MESSAGE = "I can't help with that request.";

const NO_GRANT_RECORD_MESSAGE =
  "We couldn't confirm your access to this grant. Please contact a platform administrator to request access.";

const CUT_OFF_NOTICE = "This answer was cut off. Ask me to continue.";

const ERROR_MESSAGE = "Something went wrong while answering. Try again in a moment.";

const RESET_SENTINEL = "<!RESET!>";

// Text a call writes before a tool call is narration ("I'll search for..."). Holding back the start of
// each call keeps it off screen; a call that streams past this and then calls a tool is reset instead.
const NARRATION_HOLD_CHARS = 300;

const CHAT_WORKER_MARKER = "grantwellChatWorker";

const ASYNC_PAYLOAD_LIMIT_BYTES = 256 * 1024;

const HISTORY_TURNS = 8;
const HISTORY_CHAR_BUDGET = 60000;

// About 150k tokens at ~4 characters a token. Past this the grant is searched instead.
const FULL_TEXT_MAX_CHARS = 150000 * 4;

const GRANT_SOURCE_TITLE = "Grant document";

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

// Returns null when allowed, else a payload for the client. This per-NOFO gate
// reads scope/state from DynamoDB (not KB sidecars), so it always enforces —
// independent of NOFO_STATE_FILTER_ENABLED, which only gates the KB metadata
// filter below (that one needs indexed sidecars to be present). `row` is readNofoScope's result,
// read alongside the user's attributes.
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

function buildScopeFilter(userState) {
  if (!NOFO_STATE_FILTER_ENABLED) return null;
  // No resolved state → fail closed to federal-only.
  if (!userState) {
    return { equals: { key: "scope", value: "federal" } };
  }
  return {
    orAll: [
      { equals: { key: "scope", value: "federal" } },
      {
        andAll: [
          { equals: { key: "scope", value: "state" } },
          { equals: { key: "state", value: userState } },
        ],
      },
    ],
  };
}

/**
 * Retrieves documents from the Bedrock Knowledge Base based on a query.
 * Filters results by confidence and S3 location.
 * 
 * @param {string} query - The query text.
 * @param {object} knowledgeBase - The Bedrock Knowledge Base client.
 * @param {string} knowledgeBaseID - The ID of the Knowledge Base.
 * @param {string} documentIdentifier - The document identifier for filtering.
 * @returns {object} - An object containing the retrieved content and URIs.
 */
/**
 * Runs a single KB query with a metadata filter and confidence threshold.
 * Returns { results, uris } arrays.
 */
async function runKBQuery(query, knowledgeBase, knowledgeBaseID, filter, numberOfResults, uriValidator) {
  const input = {
    knowledgeBaseId: knowledgeBaseID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults, filter }
    }
  };

  const command = new KBRetrieveCommand(input);
  const response = await knowledgeBase.send(command);

  const filtered = (response.retrievalResults || []).filter(item => {
    try {
      const uri = item.location?.s3Location?.uri;
      if (!uri || item.score <= 0.5) return false;
      return uriValidator ? uriValidator(uri) : true;
    } catch {
      return false;
    }
  });

  return {
    results: filtered,
    content: filtered.map(item => item.content.text).join('\n'),
    uris: filtered.map(item => ({
      title: item.location.s3Location.uri.slice(
        item.location.s3Location.uri.lastIndexOf("/") + 1
      ),
      uri: item.location.s3Location.uri,
    })),
  };
}

async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID, documentIdentifier, userId, scopeFilter) {
  const normalizedDocumentIdentifier = documentIdentifier.replace(/\/+$/, "");
  const folderPath = `${normalizedDocumentIdentifier}/`;
  const nofoName = normalizedDocumentIdentifier.split("/").pop() || normalizedDocumentIdentifier;
  const userDocFolderPath = userId ? `${userId}/${nofoName}/` : null;

  const nofoFilterClauses = [
    { equals: { key: "documentType", value: "NOFO" } },
    { equals: { key: "documentIdentifier", value: normalizedDocumentIdentifier } },
  ];
  if (scopeFilter) {
    nofoFilterClauses.push(scopeFilter);
  }
  const nofoFilter = { andAll: nofoFilterClauses };

  const userDocFilter = userId ? {
    andAll: [
      { equals: { key: "documentType", value: "userDocument" } },
      { equals: { key: "userId", value: userId } },
      { equals: { key: "nofoName", value: nofoName } }
    ]
  } : null;

  const noResultsMessage = `No passages matched this query in the active grant (${normalizedDocumentIdentifier}) or the user's supporting documents. This says nothing about whether the grant document is available; only this query found nothing.`;

  try {
    // Split retrieval: separate queries for NOFO and user docs to ensure balanced context
    if (userDocFilter) {
      const [nofoResult, userResult] = await Promise.all([
        runKBQuery(query, knowledgeBase, knowledgeBaseID, nofoFilter, 7, uri => uri.includes(folderPath)),
        runKBQuery(query, knowledgeBase, knowledgeBaseID, userDocFilter, 5, uri => uri.includes(userDocFolderPath)),
      ]);

      console.log(`Split retrieval - documentIdentifier: ${normalizedDocumentIdentifier}, NOFO: ${nofoResult.results.length} results, UserDocs: ${userResult.results.length} results`);

      const fullContent = [nofoResult.content, userResult.content].filter(Boolean).join('\n');
      const allUris = [...nofoResult.uris, ...userResult.uris];
      const uniqueUris = Array.from(new Map(allUris.map(item => [item.uri, item])).values());

      if (!fullContent) {
        return {
          content: noResultsMessage,
          uris: []
        };
      }

      return { content: retrievedPassages(fullContent), uris: uniqueUris };
    }

    // No user docs -- single NOFO-only query
    const nofoResult = await runKBQuery(query, knowledgeBase, knowledgeBaseID, nofoFilter, 10, uri => uri.includes(folderPath));

    console.log(`Single retrieval - documentIdentifier: ${normalizedDocumentIdentifier}, NOFO: ${nofoResult.results.length} results`);

    if (!nofoResult.content) {
      return {
        content: noResultsMessage,
        uris: []
      };
    }

    const uniqueUris = Array.from(new Map(nofoResult.uris.map(item => [item.uri, item])).values());
    return { content: retrievedPassages(nofoResult.content), uris: uniqueUris };

  } catch (error) {
    console.error("Caught error: could not retrieve Knowledge Base documents:", error);

    // Fallback without metadata filter for backward compatibility
    if (error.name === 'ValidationException' || error.message?.includes('filter')) {
      console.warn("Metadata filter failed, attempting fallback query without filter");
      try {
        const fallbackCommand = new KBRetrieveCommand({
          knowledgeBaseId: knowledgeBaseID,
          retrievalQuery: { text: query },
        });
        const fallbackResponse = await knowledgeBase.send(fallbackCommand);

        const fallbackResults = (fallbackResponse.retrievalResults || []).filter(item => {
          try {
            const uri = item.location?.s3Location?.uri;
            if (!uri || item.score <= 0.5) return false;
            return uri.includes(folderPath) || (userDocFolderPath && uri.includes(userDocFolderPath));
          } catch {
            return false;
          }
        });

        const fallbackContent = fallbackResults.map(item => item.content.text).join('\n');
        const fallbackUris = fallbackResults.map(item => ({
          title: item.location.s3Location.uri.slice(item.location.s3Location.uri.lastIndexOf("/") + 1),
          uri: item.location.s3Location.uri,
        }));

        return {
          content: fallbackContent ? retrievedPassages(fallbackContent) : noResultsMessage,
          uris: Array.from(new Map(fallbackUris.map(item => [item.uri, item])).values())
        };
      } catch (fallbackError) {
        console.error("Fallback query also failed:", fallbackError);
      }
    }

    return {
      content: `The search failed with an error for the active grant (${normalizedDocumentIdentifier}), so no passages were retrieved. The grant document itself was not checked. The user can retry, and submit feedback if it keeps failing.`,
      uris: []
    };
  }
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

/**
 * The grant's extracted text for full-text answers, or null to fall back to search: no artifacts
 * bucket, no or empty raw-text.txt, a read error, or more than the budget.
 */
async function loadGrantText(nofoName) {
  const bucket = process.env.ARTIFACTS_BUCKET;
  if (!bucket || !nofoName) return null;
  const key = `${nofoName}/raw-text.txt`;
  try {
    const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = (await result.Body?.transformToString()) ?? "";
    if (!text.trim()) {
      console.warn(`${key} is empty; answering with search`);
      return null;
    }
    if (text.length > FULL_TEXT_MAX_CHARS) {
      console.warn(`${key} is ${text.length} chars, over the ${FULL_TEXT_MAX_CHARS}-char full-text budget; answering with search`);
      return null;
    }
    return { text, uri: `s3://${bucket}/${key}` };
  } catch (err) {
    console.warn(`Could not read ${key}; answering with search:`, err.name || err.message);
    return null;
  }
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
 * Processes user messages and generates responses using AI models.
 * Retrieves relevant documents from the Bedrock Knowledge Base and updates the session history.
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
    const scopeFilter = buildScopeFilter(userState);

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
    const [withinCap, grantText, savedChat, uploadedFileNames] = await Promise.all([
      userRoles.some((r) => CAP_EXEMPT_ROLES.includes(r)) ? true : takeDailyChatMessage(userId),
      loadGrantText(nofoName),
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

    const knowledgeBase = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

    if (!process.env.KB_ID) {
      throw new Error("Knowledge Base ID is not found.");
    }

    const fullText = Boolean(grantText);
    const applicantDocuments = await loadApplicantDocuments(userId, nofoName, savedChat.documentKeys);

    let uploadedFilesList = "";
    if (uploadedFileNames.length > 0) {
      const howToUse = fullText
        ? "Their contents are not included in this chat; do not guess what they say."
        : "When the user refers to any of these documents, use your search tool to find relevant content from them.";
      uploadedFilesList = `\n\nThe user has uploaded the following documents for this grant:\n${uploadedFileNames.map((f) => `- ${f}`).join("\n")}\n${howToUse}\n`;
    }

    let claude = new ClaudeModel();
    let stopLoop = false;
    let modelResponse = '';

    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });
    const { system, messages: history } = buildChatRequest({
      instructions: getPromptText(userState, { fullText }),
      grantText: grantText?.text ?? null,
      applicantDocuments,
      context: `Active grant (documentIdentifier): ${documentIdentifier}${uploadedFilesList}\n\nToday's date is ${today} (US Eastern). Use it when a question turns on whether a deadline has passed or how much time is left.`,
      turns: savedChat.turns,
      question: fullText
        ? userMessage
        : "Please use your search tool one or more times based on this latest prompt: ".concat(userMessage),
    });
    let fullDocs = { content: "", uris: fullText ? [{ title: GRANT_SOURCE_TITLE, uri: grantText.uri }] : [] };
    let modelCalls = 0;
    let refusalCategory = null;

    const post = async (data) => {
      try {
        await wsConnectionClient.send(new PostToConnectionCommand({ ConnectionId: id, Data: data }));
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    };

    while (!stopLoop) {
      modelCalls += 1;
      const lastCall = modelCalls >= MAX_MODEL_CALLS;
      try {
        // tools stay defined on the last call because the history already holds tool_use blocks.
        const stream = await claude.getStreamedResponse(system, history, {
          tools: !fullText,
          toolChoice: lastCall && !fullText ? { type: "none" } : undefined,
        });
        let callText = "";
        let streamed = false;
        const { content, stopReason, stopDetails } = await claude.readStream(stream, async (text) => {
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
          if (lastCall) break;
          const toolUses = content.filter((block) => block.type === "tool_use");
          if (toolUses.length > 0) {
            const docs = await Promise.all(
              toolUses.map((t) =>
                retrieveKBDocs(t.input?.query || "", knowledgeBase, process.env.KB_ID, documentIdentifier, userId, scopeFilter)
              )
            );
            const toolResults = toolUses.map((t, i) => {
              fullDocs.content = fullDocs.content.concat(docs[i].content);
              fullDocs.uris = fullDocs.uris.concat(docs[i].uris);
              return { type: "tool_result", tool_use_id: t.id, content: docs[i].content };
            });
            history.push({ role: "assistant", content });
            history.push({ role: "user", content: toolResults });
          }
          continue;
        }

        if (!streamed && callText) await post(callText);
        modelResponse = callText;
        stopLoop = true;

        if (stopReason === "refusal") {
          refusalCategory = stopDetails?.category ?? "none";
        } else if (stopReason === "max_tokens") {
          const notice = modelResponse ? `\n\n${CUT_OFF_NOTICE}` : CUT_OFF_NOTICE;
          modelResponse = modelResponse.concat(notice);
          await post(notice);
        }
      } catch (error) {
        console.error("Stream processing error:", error);
        await post(`<!ERROR!>: ${ERROR_MESSAGE}`);
        return;
      }
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
      console.error("Stream processing error:", new Error(`No answer text after ${modelCalls} model calls`));
      await post(`<!ERROR!>: ${ERROR_MESSAGE}`);
      return;
    }

    let command;
    const dedupedUris = Array.from(
      new Map(fullDocs.uris.map(item => [item.uri, item])).values()
    );
    let links = JSON.stringify(dedupedUris);
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
