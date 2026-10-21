import { inScope, only, withStage } from "../lib/aws.mjs";
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
  try {
    sources = end === -1 ? [] : JSON.parse(posts[end + 1] ?? "[]");
  } catch {}
  return marker ? { answer: null, error: streamed, sources } : { answer: streamed, sources };
}

/** One websocket-chat turn per chat.json entry {id, question, history?}, through the real handler. */
export async function chat(grant, { retrieval }) {
  const turns = readOptional(grant, "chat.json");
  if (!turns) throw new Error(`eval: ${grant.slug} has no chat.json`);
  const { handler } = await import(CHAT.href);

  const posts = [];
  const routes = {
    cognito: only("AdminGetUserCommand", () => EVAL_USER),
    apigw: (command) => {
      if (command.constructor.name === "PostToConnectionCommand") posts.push(String(command.input.Data));
      return {};
    },
    lambda: only("InvokeCommand", () => ({ Payload: Buffer.from(JSON.stringify({ statusCode: 200 })) })),
    kb: retrieval.route,
  };

  return inScope(routes, async () => {
    const answers = [];
    for (const turn of turns) {
      posts.length = 0;
      await withStage(`chat:${turn.id}`, () =>
        handler({
          requestContext: { routeKey: "getChatbotResponse", connectionId: `eval-${turn.id}`, authorizer: { userId: "eval-user" } },
          body: JSON.stringify({
            data: {
              userMessage: turn.question,
              session_id: `eval-${grant.slug}`,
              chatHistory: turn.history ?? [],
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
