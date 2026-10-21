import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mockClient } from "aws-sdk-client-mock";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// reset() recreates each stub, so install() runs after it to route through the new mock.
const bedrock = mockClient(BedrockRuntimeClient);
const kb = mockClient(BedrockAgentRuntimeClient);
const ddb = mockClient(DynamoDBClient);

const usage = { input_tokens: 1000, output_tokens: 200 };
const reply = (text: string) => ({
  body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage })),
}) as any;
const stream = (events: object[]) => ({
  body: (async function* () {
    for (const e of events) yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify(e)) } };
  })(),
}) as any;

const SUMMARY = {
  EligibilityCriteria: [{ item: "Eligible applicants", description: "Municipalities." }],
  RequiredDocuments: [{ item: "Budget", description: "SF-424A." }],
  ProjectNarrativeSections: [
    { item: "Need", description: "Describe the need. Not to exceed 2 pages." },
    { item: "Approach", description: "Describe the approach." },
  ],
  KeyDeadlines: [{ item: "Application due", description: "December 1, 2026 at 5:00 PM ET." }],
};
const QUESTIONS = {
  totalQuestions: 1,
  questions: [{ id: 1, question: "How many residents does the project serve?" }],
};

function model(input: any) {
  const body = JSON.parse(input.body);
  if (body.output_config?.format) {
    const props = body.output_config.format.schema.properties;
    if (props.EligibilityCriteria) return reply(JSON.stringify(SUMMARY));
    if (props.questions) return reply(JSON.stringify(QUESTIONS));
    if (props.content) return reply(JSON.stringify({ content: "We serve 4,200 residents." }));
  }
  return reply("2026-12-01");
}

const passage = (text: string) => ({
  content: { text },
  score: 0.9,
  metadata: { grantId: "g" },
  location: { s3Location: { uri: "s3://nofos/Grant A/NOFO.pdf" } },
});

let h: any;
let golden: string;
beforeAll(async () => {
  golden = fs.mkdtempSync(path.join(os.tmpdir(), "eval-golden-"));
  const dir = path.join(golden, "grant-a");
  fs.mkdirSync(path.join(dir, "source"), { recursive: true });
  fs.writeFileSync(path.join(dir, "grant.json"), JSON.stringify({ name: "Grant A" }));
  fs.writeFileSync(path.join(dir, "source", "raw.txt"), "Grant A NOFO text. Applications are due December 1, 2026.");
  fs.writeFileSync(
    path.join(dir, "draft.json"),
    JSON.stringify({ query: "Write the application", projectBasics: { orgName: "Town of A" }, questionnaireAnswers: [] })
  );
  fs.writeFileSync(path.join(dir, "chat.json"), JSON.stringify([{ id: "q1", question: "Who is eligible?" }]));

  const aws = await import("../../eval/lib/aws.mjs");
  const env = await import("../../eval/lib/env.mjs");
  const { loadGrants } = await import("../../eval/lib/golden.mjs");
  const { costOf } = await import("../../eval/lib/cost.mjs");
  const models = env.configure({ kbId: "kb-dev" });
  h = {
    aws,
    models,
    costOf,
    grant: loadGrants(golden)[0],
    extract: (await import("../../eval/runners/extract.mjs")).extract,
    questions: (await import("../../eval/runners/questions.mjs")).questions,
    draft: (await import("../../eval/runners/draft.mjs")).draft,
    chat: (await import("../../eval/runners/chat.mjs")).chat,
  };
});

beforeEach(() => {
  bedrock.reset();
  kb.reset();
  ddb.reset();
  h.aws.install();
  bedrock.on(InvokeModelCommand).callsFake(model);
  for (const level of ["log", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

describe("eval harness", () => {
  it("uses the deployed model ids", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../lib/chatbot-api/functions/functions.ts"), "utf8");
    expect(src).toContain(`"${h.models.sonnet}"`);
    expect(src).toContain(`"${h.models.haiku}"`);
  });

  it("extract runs both handlers and records usage per stage", async () => {
    const r = await h.extract(h.grant);
    expect(r.error).toBeUndefined();
    expect(r.output.summary.ProjectNarrativeSections).toHaveLength(2);
    expect(r.output.questions.questions).toHaveLength(1);
    expect(r.output.applicationDeadline).toBe("2026-12-01");
    expect(r.usage.map((u: any) => u.stage).sort()).toEqual(["extract", "synthesize", "synthesize"]);
    expect(r.usage[0]).toMatchObject({ input: 1000, output: 200, stop: "end_turn" });
    expect(h.costOf(r.usage)).toBeGreaterThan(0);
  });

  it("questions runs from a given summary", async () => {
    const r = await h.questions(h.grant, { summary: SUMMARY });
    expect(r.output.questions.questions[0].question).toMatch(/residents/);
    expect(r.usage).toHaveLength(1);
    expect(r.usage[0].model).toBe(h.models.haiku);
  });

  it("draft records retrieval, then replays it with the KB unreachable", async () => {
    kb.on(RetrieveCommand).resolves({ retrievalResults: [passage("Need is scored at 30 points.")] } as any);
    const recording = h.aws.retrieval(h.grant.recordingPath, "record");
    const recorded = await h.draft(h.grant, { summary: SUMMARY, retrieval: recording });
    recording.save();
    expect(recorded.error).toBeUndefined();
    expect(recorded.output.sections.map((s: any) => [s.name, s.content])).toEqual([
      ["Need", "We serve 4,200 residents."],
      ["Approach", "We serve 4,200 residents."],
    ]);
    expect(new Set(recorded.usage.map((u: any) => u.stage)).size).toBe(2);
    const draftPrompt = JSON.parse(bedrock.commandCalls(InvokeModelCommand)[0].args[0].input.body as string).messages[0].content;
    expect(draftPrompt).toContain("Need is scored at 30 points.");

    kb.reset();
    h.aws.install();
    kb.on(RetrieveCommand).rejects(new Error("KB must not be called on replay"));
    const replay = h.aws.retrieval(h.grant.recordingPath, "replay");
    const replayed = await h.draft(h.grant, { summary: SUMMARY, retrieval: replay });
    expect(replayed.error).toBeUndefined();
    expect(replay.stats).toEqual({ exact: 2, nearest: 0, live: 0 });
    expect(kb.commandCalls(RetrieveCommand)).toHaveLength(0);
  });

  it("chat collects the streamed answer and its sources, and replays a new query by nearest match", async () => {
    const toolUse = (query: string) =>
      stream([
        { type: "message_start", message: { usage: { input_tokens: 500 } } },
        { type: "content_block_start", content_block: { type: "tool_use", id: "t1", name: "query_db" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: JSON.stringify({ query }) } },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 30 } },
      ]);
    const answer = () =>
      stream([
      { type: "message_start", message: { usage: { input_tokens: 900 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Municipalities " } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "are eligible." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } },
    ]);
    kb.on(RetrieveCommand).resolves({ retrievalResults: [passage("Eligible applicants are municipalities.")] } as any);
    bedrock.on(InvokeModelWithResponseStreamCommand).resolvesOnce(toolUse("eligible applicants")).resolves(answer());
    const recording = h.aws.retrieval(h.grant.recordingPath, "record");
    const r = await h.chat(h.grant, { retrieval: recording });
    recording.save();
    expect(r.error).toBeUndefined();
    expect(r.output.answers[0]).toMatchObject({ id: "q1", answer: "Municipalities are eligible." });
    expect(r.output.answers[0].sources[0].uri).toBe("s3://nofos/Grant A/NOFO.pdf");
    expect(r.usage.map((u: any) => [u.input, u.output, u.stop])).toEqual([
      [500, 30, "tool_use"],
      [900, 12, "end_turn"],
    ]);

    kb.reset();
    bedrock.reset();
    h.aws.install();
    kb.on(RetrieveCommand).rejects(new Error("KB must not be called on replay"));
    bedrock.on(InvokeModelWithResponseStreamCommand).resolvesOnce(toolUse("who is an eligible applicant")).resolves(answer());
    const replay = h.aws.retrieval(h.grant.recordingPath, "replay");
    const again = await h.chat(h.grant, { retrieval: replay });
    expect(again.output.answers[0].answer).toBe("Municipalities are eligible.");
    expect(replay.stats.nearest).toBeGreaterThan(0);
  });

  it("refuses any AWS call the runner did not route", async () => {
    const { DynamoDBClient: Client, GetItemCommand } = await import("@aws-sdk/client-dynamodb");
    const r = await h.aws.inScope({}, () =>
      new Client({}).send(new GetItemCommand({ TableName: "real", Key: { id: { S: "x" } } }))
    );
    expect(r.error).toMatch(/no route for dynamodb GetItemCommand/);
    expect(ddb.commandCalls(GetItemCommand)).toHaveLength(0);
  });
});
