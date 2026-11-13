import fs from "node:fs";
import { inScope, only, s3Body, withStage } from "../lib/aws.mjs";
import { readOptional } from "../lib/golden.mjs";

const CHAT = new URL("../../lib/chatbot-api/functions/websocket-chat/index.mjs", import.meta.url);
const EOF = "!<|EOF_STREAM|>!";
const MARKERS = ["<!ERROR!>", "<!LIMIT!>", "<!ACCESS_DENIED!>"];

// Developer skips the per-grant access check and the daily cap; neither changes the answer.
const EVAL_USER = { UserAttributes: [{ Name: "custom:role", Value: '["Developer"]' }] };

function readPosts(posts) {
  const end = posts.indexOf(EOF);
  const streamed = (end === -1 ? posts : posts.slice(0, end)).join("");
  const marker = MARKERS.find((m) => streamed.startsWith(m));
  let sources = [];
  let citations = [];
  try {
    const meta = end === -1 ? [] : JSON.parse(posts[end + 1] ?? "[]");
    sources = Array.isArray(meta) ? meta : meta.Sources ?? [];
    citations = Array.isArray(meta) ? [] : meta.Citations ?? [];
  } catch {}
  return marker ? { answer: null, error: streamed, sources } : { answer: streamed, sources, citations };
}

const sessionReply = (body) => ({ Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: JSON.stringify(body) })) });

/**
 * One websocket-chat turn per chat.json entry {id, question, history?}, through the real handler.
 * The handler reads the grant's text from source/raw.txt (summary.json when there is none) and a
 * turn's history from the session store.
 */
export async function chat(grant) {
  const turns = readOptional(grant, "chat.json");
  if (!turns) throw new Error(`eval: ${grant.slug} has no chat.json`);
  const { handler } = await import(CHAT.href);
  const rawText = fs.existsSync(grant.rawPath) ? fs.readFileSync(grant.rawPath, "utf8") : null;
  const summary = readOptional(grant, "summary.json");

  const posts = [];
  let history = [];
  const routes = {
    cognito: only("AdminGetUserCommand", () => EVAL_USER),
    apigw: (command) => {
      if (command.constructor.name === "PostToConnectionCommand") posts.push(String(command.input.Data));
      return {};
    },
    lambda: only("InvokeCommand", (command) => {
      const request = JSON.parse(JSON.parse(command.input.Payload).body);
      return sessionReply(request.operation === "get_session" ? { chat_history: history } : {});
    }),
    s3: (command) => {
      const key = command.input.Key ?? "";
      if (command.constructor.name === "ListObjectsV2Command") return {};
      if (key.endsWith("/raw-text.txt") && rawText) return { Body: s3Body(rawText) };
      if (key.endsWith("/summary.json") && summary) return { Body: s3Body(JSON.stringify(summary)) };
      throw Object.assign(new Error(`eval: no ${key}`), { name: "NoSuchKey" });
    },
  };

  return inScope(routes, async () => {
    const answers = [];
    for (const turn of turns) {
      posts.length = 0;
      history = turn.history ?? [];
      await withStage(`chat:${turn.id}`, () =>
        handler({
          requestContext: { routeKey: "getChatbotResponse", connectionId: `eval-${turn.id}`, authorizer: { userId: "eval-user" } },
          body: JSON.stringify({
            data: {
              userMessage: turn.question,
              session_id: `eval-${grant.slug}`,
              documentIdentifier: `${grant.name}/`,
            },
          }),
        })
      );
      answers.push({ id: turn.id, question: turn.question, ...readPosts(posts) });
    }
    return { answers };
  });
}
