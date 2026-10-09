import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../lib/monitoring/monitoring-stack";

const aws = vi.hoisted(() => {
  class Command {
    constructor(public input: any) {}
  }
  const command = (name: string) => ({ [name]: class extends Command {} })[name];
  const client = (send: (cmd: any) => unknown) =>
    class {
      send = send;
    };
  return { command, client, runtime: vi.fn(), agent: vi.fn() };
});

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: aws.client(async (cmd: any) => aws.runtime(cmd.input)),
  InvokeModelCommand: aws.command("InvokeModelCommand"),
}));
vi.mock("@aws-sdk/client-bedrock-agent-runtime", () => ({
  BedrockAgentRuntimeClient: aws.client(async (cmd: any) => aws.agent(cmd.input)),
  RerankCommand: aws.command("RerankCommand"),
}));

const handlerPath = path.join(__dirname, "../lib/monitoring/functions/model-canary/index.mjs");
const { FAILURE_MARKER, commandFor, handler, runCanary } = await import(handlerPath);

const SONNET = { label: "chat (Sonnet)", kind: "anthropic", modelId: "arn:aws:bedrock:us-east-1:1:application-inference-profile/sonnet" };
const HAIKU = { label: "scraper (Haiku)", kind: "anthropic", modelId: "arn:aws:bedrock:us-east-1:1:application-inference-profile/haiku" };
const TITAN = { label: "grant search embeddings (Titan)", kind: "titan-embed", modelId: "amazon.titan-embed-text-v2:0" };
const RERANK = { label: "grant search reranking (Cohere)", kind: "rerank", modelId: "arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0" };
const MODELS = [SONNET, HAIKU, TITAN, RERANK];

const accessDenied = Object.assign(new Error("You don't have access to the model with the specified model ID.\nmore"), {
  name: "AccessDeniedException",
});

beforeEach(() => {
  aws.runtime.mockReset().mockResolvedValue({ body: new TextEncoder().encode("{}") });
  aws.agent.mockReset().mockResolvedValue({ results: [{ index: 0, relevanceScore: 1 }] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.MODELS = JSON.stringify(MODELS);
});

describe("model canary requests", () => {
  it("asks Claude for one output token through the app's profile", () => {
    const { client, command } = commandFor(SONNET);
    expect(client).toBe("runtime");
    expect(command.input.modelId).toBe(SONNET.modelId);
    const body = JSON.parse(command.input.body);
    expect(body).toMatchObject({ anthropic_version: "bedrock-2023-05-31", max_tokens: 1 });
    expect(body.thinking).toBeUndefined();
  });

  it("embeds a one-word input with Titan", () => {
    const { client, command } = commandFor(TITAN);
    expect(client).toBe("runtime");
    expect(command.input.modelId).toBe(TITAN.modelId);
    expect(JSON.parse(command.input.body)).toEqual({ inputText: "ok" });
  });

  it("reranks one document through bedrock-agent-runtime, as grant search does", () => {
    const { client, command } = commandFor(RERANK);
    expect(client).toBe("agent");
    expect(command.input.sources).toHaveLength(1);
    expect(command.input.rerankingConfiguration.bedrockRerankingConfiguration).toEqual({
      numberOfResults: 1,
      modelConfiguration: { modelArn: RERANK.modelId },
    });
  });
});

describe("model canary results", () => {
  it("returns ok with one result per model when everything answers", async () => {
    const summary = await handler();
    expect(summary.ok).toBe(true);
    expect(summary.results.map((r: any) => [r.model, r.ok])).toEqual(MODELS.map((m) => [m.label, true]));
    expect(aws.runtime).toHaveBeenCalledTimes(3);
    expect(aws.agent).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("checks every model even when one fails, and reports the failure's name and first line", async () => {
    aws.runtime.mockImplementation(async (input: any) => {
      if (input.modelId === HAIKU.modelId) throw accessDenied;
      return {};
    });
    const summary = await runCanary(MODELS, { runtime: { send: (c: any) => aws.runtime(c.input) }, agent: { send: (c: any) => aws.agent(c.input) } });
    expect(summary.ok).toBe(false);
    expect(summary.results.find((r: any) => r.model === HAIKU.label)).toEqual({
      model: HAIKU.label,
      modelId: HAIKU.modelId,
      ok: false,
      errorName: "AccessDeniedException",
      message: "You don't have access to the model with the specified model ID.",
    });
    expect(summary.results.filter((r: any) => r.ok)).toHaveLength(3);
  });

  it("throws, so Lambda counts an error, and logs the pinned marker once per failed model", async () => {
    aws.runtime.mockRejectedValue(accessDenied);
    aws.agent.mockRejectedValue(Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" }));
    await expect(handler()).rejects.toThrow(/^4 of 4 Bedrock models failed:/);

    expect(FAILURE_MARKER).toBe(LOG_MARKERS.modelCanaryFailed[0]);
    const lines = vi.mocked(console.error).mock.calls.map(([line]) => line as string);
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line.startsWith(`${LOG_MARKERS.modelCanaryFailed[0]} `)).toBe(true);
    expect(lines).toContain(`${FAILURE_MARKER} ${RERANK.label} (${RERANK.modelId}): ThrottlingException: Rate exceeded`);
  });

  it("refuses to pass with nothing to check", async () => {
    process.env.MODELS = "[]";
    await expect(handler()).rejects.toThrow(/no models/);
  });

  it("reports an unknown model kind as that model's failure", async () => {
    const summary = await runCanary([{ label: "x", kind: "image", modelId: "m" }], {});
    expect(summary).toMatchObject({ ok: false, results: [{ model: "x", ok: false, message: 'Unknown model kind "image"' }] });
  });
});

// Verified against @aws-sdk/client-bedrock-runtime and client-bedrock-agent-runtime 3.1105.0, the SDK the nodejs24.x runtime ships.
const RUNTIME_SDK_3_1105_0: Record<string, string[]> = {
  "@aws-sdk/client-bedrock-runtime": ["BedrockRuntimeClient", "InvokeModelCommand"],
  "@aws-sdk/client-bedrock-agent-runtime": ["BedrockAgentRuntimeClient", "RerankCommand"],
};

it("imports only names the runtime's SDK 3.1105.0 has", () => {
  const source = readFileSync(handlerPath, "utf8");
  const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@aws-sdk\/[^"]+)"/g)];
  expect(imports.map(([, , pkg]) => pkg).sort()).toEqual(Object.keys(RUNTIME_SDK_3_1105_0).sort());
  for (const [, names, pkg] of imports) {
    for (const name of names.split(",").map((n) => n.trim()).filter(Boolean)) {
      expect(RUNTIME_SDK_3_1105_0[pkg], `${pkg} ${name}`).toContain(name);
    }
  }
});
