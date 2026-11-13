import { mockClient } from "aws-sdk-client-mock";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { AdminGetUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";
import {
  CHECK_MARKER,
  absenceTopic,
  dateStatusFailures,
  weekdayFailures,
  meaningRequest,
  mentions,
  problemsText,
  removeUnits,
  splitSentences,
} from "../../lib/chatbot-api/functions/websocket-chat/verify.mjs";

const ws = mockClient(ApiGatewayManagementApiClient);
const bedrock = mockClient(BedrockRuntimeClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);
const s3 = mockClient(S3Client);

const HAIKU = "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat-verify";

let handler: (event: any) => Promise<any>;
beforeAll(async () => {
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "example");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  vi.stubEnv("SESSION_HANDLER", "session-fn");
  vi.stubEnv("WEBSOCKET_API_ENDPOINT", "https://ws.example");
  vi.stubEnv("NOFO_METADATA_TABLE_NAME", "nofos");
  vi.stubEnv("DAILY_USAGE_TABLE_NAME", "daily-usage");
  vi.stubEnv("USER_POOL_ID", "pool-1");
  vi.stubEnv("ARTIFACTS_BUCKET", "grant-artifacts");
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
  vi.stubEnv("SONNET_MODEL_ID", "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/chat");
  vi.stubEnv("VERIFY_MODEL_ID", HAIKU);
  ({ handler } = await import("../../lib/chatbot-api/functions/websocket-chat/index.mjs"));
});

function stream(events: object[]) {
  return {
    body: (async function* () {
      for (const e of events) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
    })(),
  } as any;
}
const cited = (parts: Array<string | [string, object]>, stopReason = "end_turn") =>
  stream([
    ...parts.flatMap((p) => {
      const [t, citation] = typeof p === "string" ? [p, null] : p;
      return [
        { type: "content_block_start", content_block: { type: "text", text: "" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: t } },
        ...(citation ? [{ type: "content_block_delta", delta: { type: "citations_delta", citation } }] : []),
        { type: "content_block_stop" },
      ];
    }),
    { type: "message_delta", delta: { stop_reason: stopReason } },
  ]);

const rawText = (text: string) => ({ Body: { transformToString: async () => text } }) as any;
const GRANT_TEXT = "Section D.4 Applications are due March 1, 2027. Late applications are not reviewed. Cities may apply.";
const deadline = { type: "char_location", cited_text: "Applications are due March 1, 2027.", document_index: 0, start_char_index: 12, end_char_index: 47 };
const late = { type: "char_location", cited_text: "Late applications are not reviewed.", document_index: 0, start_char_index: 48, end_char_index: 83 };
const section = { type: "char_location", cited_text: "Section D.4", document_index: 0, start_char_index: 0, end_char_index: 11 };
const cities = { type: "char_location", cited_text: "Cities may apply.", document_index: 0, start_char_index: 84, end_char_index: 101 };

const event = (userMessage = "What is the deadline?") => ({
  requestContext: { connectionId: "c1", routeKey: "getChatbotResponse", authorizer: { userId: "user-1" } },
  body: JSON.stringify({ data: { userMessage, session_id: "s1", documentIdentifier: "Grant A/" } }),
});

const sessionReply = (body: object) => ({
  Payload: new TextEncoder().encode(JSON.stringify({ statusCode: 200, body: JSON.stringify(body) })) as any,
});
const sonnetCalls = () => bedrock.commandCalls(InvokeModelWithResponseStreamCommand);
const sonnetRequest = (n: number) => JSON.parse(sonnetCalls()[n].args[0].input.body as string);
const haikuCalls = () => bedrock.commandCalls(InvokeModelCommand);
const haikuRequest = (n = 0) => JSON.parse(haikuCalls()[n].args[0].input.body as string);
const posted = () => ws.commandCalls(PostToConnectionCommand).map((c) => String(c.args[0].input.Data));
const saves = () =>
  lambda
    .commandCalls(InvokeCommand)
    .map((c) => JSON.parse(JSON.parse(String(c.args[0].input.Payload)).body))
    .filter((b) => b.operation === "update_session");
const checkLog = () =>
  (console.log as any).mock.calls.map(([line]: [unknown]) => String(line)).filter((l: string) => l.startsWith(`${CHECK_MARKER} `));
const checkLines = () => checkLog().map((l: string) => JSON.parse(l.slice(CHECK_MARKER.length + 1)));

const sentencesOf = (input: any) =>
  [...JSON.parse(input.body).messages[0].content.at(-1).text.matchAll(/<sentence id="(\d+)">\n<text>([^<]*)<\/text>/g)].map((m) => ({
    id: Number(m[1]),
    text: m[2],
  }));
const verdictReply = (verdicts: object[]) => ({
  body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ verdicts }) }], stop_reason: "end_turn" })),
}) as any;
const judge = (rule: (text: string) => string) => (input: any) =>
  verdictReply(sentencesOf(input).map(({ id, text }) => ({ id, verdict: rule(text), reason: "checked" })));
let postsAtHaiku: number[] = [];

beforeEach(() => {
  for (const m of [ws, bedrock, cognito, ddb, lambda, s3]) m.reset();
  postsAtHaiku = [];
  ws.on(PostToConnectionCommand).resolves({});
  ws.on(DeleteConnectionCommand).resolves({});
  cognito.on(AdminGetUserCommand).resolves({ UserAttributes: [{ Name: "custom:state", Value: "MA" }] });
  ddb.on(GetItemCommand).resolves({ Item: { nofo_name: { S: "Grant A" }, scope: { S: "federal" } } });
  ddb.on(UpdateItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves(sessionReply({}));
  s3.on(ListObjectsV2Command).resolves({});
  s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "Grant A/raw-text.txt" }).resolves(rawText(GRANT_TEXT));
  bedrock.on(InvokeModelCommand).callsFake((input) => {
    postsAtHaiku.push(posted().length);
    return judge(() => "supported")(input);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("answer units", () => {
  it("splits sentences, keeps list items and headings whole, and skips abbreviations", () => {
    const text = "Applications are due at 5 p.m. Eastern. The U.S. agency reviews them.\n\n### Who can apply\n- Cities, e.g. Boston. Towns too.\n1. A budget.";
    expect(splitSentences(text).map((u: any) => u.text)).toEqual([
      "Applications are due at 5 p.m. Eastern.",
      "The U.S. agency reviews them.",
      "### Who can apply",
      "- Cities, e.g. Boston. Towns too.",
      "1. A budget.",
    ]);
    for (const u of splitSentences(text)) expect(text.slice(u.start, u.end)).toBe(u.text);
  });

  it("removes units without breaking paragraphs or list lines and shifts later citations", () => {
    const text = "Due March 1. Late ones get 10% off.\n\n- Cities.\n- Towns.\n\nCall the officer.";
    const units = splitSentences(text);
    const at = (s: string) => text.indexOf(s) + s.length;
    const found = [
      { citation: { n: "due" }, from: 0, at: at("Due March 1.") },
      { citation: { n: "late" }, from: 12, at: at("10% off.") },
      { citation: { n: "towns" }, from: text.indexOf("- Towns"), at: at("- Towns.") },
    ];

    const out = removeUnits(text, units, [1, 2], found);

    expect(out.text).toBe("Due March 1.\n\n- Towns.\n\nCall the officer.");
    expect(out.found.map((f: any) => [f.citation.n, out.text.slice(0, f.at)])).toEqual([
      ["due", "Due March 1."],
      ["towns", "Due March 1.\n\n- Towns."],
    ]);
  });

  it("removes a leading paragraph without leaving blank lines first", () => {
    const text = "Wrong claim.\n\nKept claim.";
    const out = removeUnits(text, splitSentences(text), [0], [{ citation: {}, from: 14, at: 25 }]);
    expect(out).toEqual({ text: "Kept claim.", found: [{ citation: {}, from: 0, at: 11 }] });
  });

  it("finds the topic of a 'the grant doesn't say' sentence and whether the grant mentions it", () => {
    expect(absenceTopic("The grant doesn't say whether a letter of intent is required.")).toBe("letter intent");
    expect(absenceTopic("The notice does not mention any cost share.")).toBe("cost share");
    expect(absenceTopic("The grant is silent on indirect costs.")).toBe("indirect costs");
    expect(absenceTopic("Applications are due March 1.")).toBeNull();
    const grant = "Applicants must submit Letters of Intent by January 5. A cost share of 20% applies.";
    expect(mentions(grant, "letter intent")).toBe(true);
    expect(mentions(grant, "cost share")).toBe(true);
    expect(mentions(grant, "indirect costs")).toBe(false);
  });

  it("catches a stated date wrongly called passed or not passed", () => {
    const units = splitSentences(
      "The August 26, 2026 date has not passed. The March 1, 2027 deadline is still open. The May 15, 2026 date has already passed. Applications close March 1, 2027."
    );
    expect(dateStatusFailures(units, "November 4, 2026")).toEqual([0]);
  });

  it("catches a weekday that doesn't match its date, and a future date said to be due in the past", () => {
    expect(weekdayFailures(splitSentences("It was due on a Thursday (October 9, 2026). It is due Wednesday, October 7, 2026."))).toEqual([0]);
    expect(weekdayFailures(splitSentences("Applications are due Wednesday, October 9, 2026."), "Applications are due to MSA on Wednesday, Oct 9, 2026 by 2:00 P.M.")).toEqual([]);
    expect(dateStatusFailures(splitSentences("The pre-application was due December 22, 2026."), "November 4, 2026")).toEqual([0]);
    expect(absenceTopic("The grant doesn't explain how the base and country deadlines fit together.")).toBe("base country deadlines fit");
  });

  it("drops a heading whose every sentence was removed", () => {
    const text = "### Eligibility\nCities may apply.\n\n### Budget\nThe cap is $9 billion.";
    const units = splitSentences(text);
    const failing = units.flatMap((u: { text: string }, i: number) => (u.text.includes("$9 billion") ? [i] : []));
    expect(removeUnits(text, units, failing).text).toBe("### Eligibility\nCities may apply.");
  });

  it("gives the meaning check the user's documents in summary mode", () => {
    const units = splitSentences("Your match is $415,000.");
    const prompt = meaningRequest({ units, summary: "{}", documentText: "The board approved a $415,000 match." }).messages[0].content.at(-1).text;
    expect(prompt).toContain("<supporting_documents>\nThe board approved a $415,000 match.\n</supporting_documents>");
  });

  it("names why each statement failed when asking again", () => {
    expect(problemsText([{ text: "- November 5, 2026 (passed)", reason: "it says a date has or hasn't passed wrongly for today (November 4, 2026); mark each date on its own" }])).toContain(
      '- "November 5, 2026 (passed)" (it says a date has or hasn\'t passed wrongly for today (November 4, 2026); mark each date on its own)'
    );
    expect(dateStatusFailures(splitSentences("- October 5, 2026 (passed)\n- November 5, 2026 (passed)"), "November 4, 2026")).toEqual([1]);
  });

  it("asks for the answer again with the statements that failed", () => {
    expect(problemsText(["- Cities get $5 million.", "It closes in 3 days."])).toBe(
      'These statements could not be confirmed in the grant:\n- "Cities get $5 million."\n- "It closes in 3 days."\nAnswer again using only what the grant states; where the grant doesn\'t say, say so.'
    );
  });
});

describe("chat answers, checked after sending", () => {
  const SOURCES = [{ title: "Grant document", uri: "s3://grant-artifacts/Grant A/raw-text.txt" }];

  it("posts and saves the answer before the check runs, then logs what the check found", async () => {
    let savedAtHaiku = -1;
    let closedAtHaiku = -1;
    bedrock.on(InvokeModelCommand).callsFake((input) => {
      postsAtHaiku.push(posted().length);
      savedAtHaiku = saves().length;
      closedAtHaiku = ws.commandCalls(DeleteConnectionCommand).length;
      return judge(() => "supported")(input);
    });
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(
      cited([["Applications are due March 1, 2027.", deadline], [" Late applications are not reviewed.", late]])
    );

    await handler(event());

    const answer = "Applications are due March 1, 2027. Late applications are not reviewed.";
    expect(posted()).toEqual([
      answer,
      "!<|EOF_STREAM|>!",
      JSON.stringify({
        Sources: SOURCES,
        Citations: [
          { n: 1, at: [35], quote: deadline.cited_text, document: "Grant document" },
          { n: 2, at: [answer.length], quote: late.cited_text, document: "Grant document" },
        ],
      }),
    ]);
    expect(postsAtHaiku).toEqual([3]);
    expect(savedAtHaiku).toBe(1);
    expect(closedAtHaiku).toBe(1);
    expect(sonnetCalls()).toHaveLength(1);
    expect(saves()[0].new_chat_entry[0].chatbot).toBe(answer);
    expect(JSON.parse(saves()[0].new_chat_entry[0].metadata)).not.toHaveProperty("Verified");
    expect(checkLines()).toEqual([
      { session: "s1", grant: "Grant A", question: "What is the deadline?", sentences: 2, flagged: [], ms: expect.any(Number) },
    ]);
    expect(checkLog()).not.toContain("user-1");
  });

  it("sends the checker the whole grant, cached, then each sentence with its own cited passages", async () => {
    s3.on(GetObjectCommand, { Bucket: "grant-artifacts", Key: "Grant A/raw-text.txt" }).resolves(rawText(`${GRANT_TEXT} ${"Filler. ".repeat(500)}`));
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline], " Plan ahead."]));

    await handler(event());

    expect(haikuCalls()[0].args[0].input.modelId).toBe(HAIKU);
    const body = haikuRequest();
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(body.output_config.format.schema.properties.verdicts.items.properties.verdict.enum).toEqual(["supported", "unsupported", "not_a_claim"]);
    const prompt = body.messages[0].content.at(-1).text;
    expect(prompt).toContain(
      '<sentence id="1">\n<text>Applications are due March 1, 2027.</text>\n<passage document="Grant document">Applications are due March 1, 2027.</passage>\n</sentence>'
    );
    expect(prompt).toContain('<sentence id="2">\n<text>Plan ahead.</text>\n<no_passage/>\n</sentence>');
    expect(prompt).not.toContain("<user_said>");
    expect(prompt).toContain("<question>What is the deadline?</question>");
    expect(prompt).not.toContain("Filler.");
    const grantBlock = body.messages[0].content[0];
    expect(grantBlock.cache_control).toEqual({ type: "ephemeral" });
    expect(grantBlock.text).toContain("Applications are due March 1, 2027.");
    expect(grantBlock.text).toContain("Filler.");
  });

  it("posts a flagged answer unchanged, without asking again, and logs each flagged sentence", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(
      cited([["Applications are due March 3, 2027.", deadline], [" Nonprofits may apply.", section], [" Cities may apply.", cities]])
    );
    bedrock.on(InvokeModelCommand).callsFake(judge((t) => (t.startsWith("Nonprofits") ? "unsupported" : "supported")));

    await handler(event("Who can apply, and by when?"));

    const answer = "Applications are due March 3, 2027. Nonprofits may apply. Cities may apply.";
    expect(sonnetCalls()).toHaveLength(1);
    expect(posted()[0]).toBe(answer);
    expect(JSON.parse(posted()[2]).Citations).toHaveLength(3);
    expect(saves()[0].new_chat_entry[0].chatbot).toBe(answer);
    expect(checkLines()).toEqual([
      {
        session: "s1",
        grant: "Grant A",
        question: "Who can apply, and by when?",
        sentences: 3,
        flagged: [
          { text: "Applications are due March 3, 2027.", reason: "a date, amount or number in it isn't in the grant", kind: "fact" },
          { text: "Nonprofits may apply.", reason: "checked", kind: "meaning" },
        ],
        ms: expect.any(Number),
      },
    ]);
  });

  it("names date, weekday and 'the grant doesn't say' findings by kind", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(
      cited([
        "The March 1, 2027 deadline has already passed.",
        " It is due on a Friday (March 1, 2027).",
        " The grant doesn't say whether late applications are reviewed.",
      ])
    );
    bedrock.on(InvokeModelCommand).callsFake(judge((t) => (t.startsWith("The grant doesn't say") ? "not_a_claim" : "supported")));

    await handler(event());

    expect(posted()[0]).toContain("The grant doesn't say whether late applications are reviewed.");
    expect(checkLines()[0].flagged.map((f: { kind: string }) => f.kind)).toEqual(["date", "weekday", "absence"]);
    expect(checkLines()[0].flagged[2].reason).toBe("the grant does mention late reviewed");
  });

  it("clips a long question and long sentences in the log line", async () => {
    const sentence = `Cities ${"really ".repeat(80)}may apply.`;
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([sentence]));
    bedrock.on(InvokeModelCommand).callsFake(judge(() => "unsupported"));

    await handler(event(`Can cities apply? ${"Please explain. ".repeat(40)}`));

    const [line] = checkLines();
    expect(line.question).toHaveLength(200);
    expect(line.question.endsWith("…")).toBe(true);
    expect(line.flagged[0].text).toHaveLength(300);
    expect(posted()[0]).toBe(sentence);
  });

  it("still posts and saves the answer when the checker fails, and logs the failure", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline]]));
    bedrock.on(InvokeModelCommand).rejects(new Error("ThrottlingException"));

    await handler(event());

    expect(posted()[0]).toBe("Applications are due March 1, 2027.");
    expect(posted()[1]).toBe("!<|EOF_STREAM|>!");
    expect(saves()[0].new_chat_entry[0].chatbot).toBe("Applications are due March 1, 2027.");
    const counts = ddb.commandCalls(UpdateItemCommand).map((c) => c.args[0].input.ExpressionAttributeValues);
    expect(counts).toEqual([expect.objectContaining({ ":one": { N: "1" } })]);
    expect(checkLines()).toEqual([
      { error: "ThrottlingException", session: "s1", grant: "Grant A", question: "What is the deadline?", ms: expect.any(Number) },
    ]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("gives up on a checker that never answers", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline]]));
    bedrock.on(InvokeModelCommand).callsFake(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const done = handler(event());
      await vi.waitFor(() => expect(haikuCalls()).toHaveLength(1));
      expect(posted()[0]).toBe("Applications are due March 1, 2027.");
      await vi.advanceTimersByTimeAsync(60000);
      await done;
    } finally {
      vi.useRealTimers();
    }

    expect(checkLines()).toEqual([expect.objectContaining({ error: "check timed out after 60000 ms", session: "s1" })]);
  });

  it("lets user-given facts pass the fact check, and shows the meaning check the chat only to judge sentences about the chat", async () => {
    lambda.on(InvokeCommand).callsFake((input) =>
      String(input.Payload).includes("get_session")
        ? sessionReply({ chat_history: [{ user: "We serve 4,200 residents.", chatbot: "Noted.", metadata: "[]" }] })
        : sessionReply({})
    );
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited(["Your $250,000 budget for 4,200 residents is yours to set."]));

    await handler(event("Our budget is $250,000. Is that allowed?"));

    expect(posted()[0]).toBe("Your $250,000 budget for 4,200 residents is yours to set.");
    expect(checkLines()[0].flagged).toEqual([]);
    const request = haikuRequest();
    const prompt = request.messages[0].content.at(-1).text;
    expect(prompt).toContain("for judging sentences about this chat only:\n<chat_history>\n<user>We serve 4,200 residents.</user>\n<assistant>Noted.</assistant>\n</chat_history>");
    expect(prompt).toContain("<question>Our budget is $250,000. Is that allowed?</question>");
    expect(request.system).toContain("The chat history is never a source for facts about the grant.");
  });

  it("tells the model when older turns of the chat are left out", async () => {
    lambda.on(InvokeCommand).callsFake((input) =>
      String(input.Payload).includes("get_session")
        ? sessionReply({ chat_history: [{ user: "Earlier question", chatbot: "Earlier answer", metadata: "[]" }], older_cursor: "12" })
        : sessionReply({})
    );
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline]]));

    await handler(event("What did we talk about?"));

    const context = sonnetRequest(0).messages.at(-1).content.at(-2).text;
    expect(context).toContain("Earlier turns of this chat are not shown here.");
  });

  it("counts claims the answer didn't cite", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline], " Cities may apply."]));

    await handler(event("Who can apply, and by when?"));

    expect(checkLines()[0]).toMatchObject({ uncited: 1 });
    expect(checkLines()[0]).not.toHaveProperty("verbatimTail");
  });

  it("checks a summary-mode answer against the summary, sent once", async () => {
    const summary = JSON.stringify({ GrantName: "Grant A", Deadline: "March 1, 2027" });
    s3.on(GetObjectCommand, { Key: "Grant A/raw-text.txt" }).rejects(Object.assign(new Error("missing"), { name: "NoSuchKey" }));
    s3.on(GetObjectCommand, { Key: "Grant A/summary.json" }).resolves(rawText(summary));
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited(["Applications are due March 1, 2027, and up to $5 million is available."]));

    await handler(event());

    expect(sonnetCalls()).toHaveLength(1);
    const prompt = haikuRequest().messages[0].content.at(-1).text;
    expect(prompt.split("<grant_summary>")).toHaveLength(2);
    expect(prompt).toContain("Deadline");
    expect(prompt).not.toContain("<passage");
    expect(posted()).toEqual([
      "Applications are due March 1, 2027, and up to $5 million is available.",
      "!<|EOF_STREAM|>!",
      JSON.stringify([{ title: "Grant summary", uri: "s3://grant-artifacts/Grant A/summary.json" }]),
    ]);
    expect(checkLines()[0].flagged).toEqual([expect.objectContaining({ kind: "fact" })]);
  });

  it("adds the cut-off notice to the answer but checks only the model's text", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([["Applications are due March 1, 2027.", deadline], " The other"], "max_tokens"));
    bedrock.on(InvokeModelCommand).callsFake(judge((t) => (t === "The other" ? "not_a_claim" : "supported")));

    await handler(event());

    expect(posted()[0]).toBe("Applications are due March 1, 2027. The other\n\nThis answer was cut off. Ask me to continue.");
    expect(checkLines()[0]).toMatchObject({ sentences: 2, flagged: [] });
  });

  it("checks nothing when the model was cut off before writing anything", async () => {
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves(cited([], "max_tokens"));

    await handler(event());

    expect(posted()[0]).toBe("This answer was cut off. Ask me to continue.");
    expect(haikuCalls()).toHaveLength(0);
    expect(checkLines()).toEqual([]);
  });

  it("counts the check's lines in the ChatVerified metric", () => {
    expect(LOG_MARKERS.chatVerified).toEqual([CHECK_MARKER]);
    expect(LOG_MARKERS.chatAnswerFailed).not.toContain(CHECK_MARKER);
  });
});
