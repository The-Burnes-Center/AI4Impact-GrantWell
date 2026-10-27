import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";

const CLIENTS = {
  apigw: ApiGatewayManagementApiClient,
  kb: BedrockAgentRuntimeClient,
  bedrock: BedrockRuntimeClient,
  cognito: CognitoIdentityProviderClient,
  dynamodb: DynamoDBClient,
  lambda: LambdaClient,
  s3: S3Client,
};

const store = new AsyncLocalStorage();
const ROUTED = Symbol("eval-routed");

export const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 16);

/**
 * Routes every SDK send() through the active scope's routes. A call with no route throws, so an
 * eval run can never write to a real table, bucket or connection.
 */
export function install() {
  for (const [name, Client] of Object.entries(CLIENTS)) {
    const real = Client.prototype.send;
    if (real[ROUTED]) continue;
    Client.prototype.send = async function (command, ...rest) {
      const scope = store.getStore();
      const route = scope?.routes[name];
      if (!route) throw new Error(`eval: no route for ${name} ${command.constructor.name}`);
      return route(command, () => real.call(this, command, ...rest), scope);
    };
    Client.prototype.send[ROUTED] = true;
  }
}

/** Runs fn with its own routes and usage list; a failure keeps the usage spent before it. */
export function inScope(routes, fn) {
  const scope = { routes: { bedrock: liveBedrock, ...routes }, usage: [], stage: "" };
  return store.run(scope, async () => {
    try {
      return { output: await fn(), usage: scope.usage };
    } catch (e) {
      return { error: `${e.name}: ${e.message}`, usage: scope.usage };
    }
  });
}

/** Labels the usage rows fn produces; concurrent stages keep their own labels. */
export function withStage(stage, fn) {
  const parent = store.getStore();
  return store.run({ ...parent, stage }, fn);
}

const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

function usageRow(scope, command, t0, u, stop, firstTokenMs) {
  return {
    stage: scope.stage,
    model: command.input.modelId,
    promptHash: sha(command.input.body),
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    stop,
    ms: Date.now() - t0,
    ...(firstTokenMs !== undefined && { firstTokenMs }),
  };
}

async function liveBedrock(command, send, scope) {
  const t0 = Date.now();
  const res = await send();
  if (command.constructor.name === "InvokeModelCommand") {
    const body = decode(res.body);
    scope.usage.push(usageRow(scope, command, t0, body.usage ?? {}, body.stop_reason));
    return res;
  }
  const source = res.body;
  res.body = (async function* () {
    const u = {};
    let stop;
    let firstTokenMs;
    try {
      for await (const event of source) {
        if (event.chunk?.bytes) {
          const chunk = decode(event.chunk.bytes);
          if (chunk.type === "message_start") Object.assign(u, chunk.message?.usage);
          if (firstTokenMs === undefined && chunk.type === "content_block_delta") firstTokenMs = Date.now() - t0;
          if (chunk.type === "message_delta") {
            Object.assign(u, chunk.usage);
            stop = chunk.delta?.stop_reason ?? stop;
          }
        }
        yield event;
      }
    } finally {
      scope.usage.push(usageRow(scope, command, t0, u, stop, firstTokenMs));
    }
  })();
  return res;
}

const words = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []);

function overlap(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(1, a.size + b.size - shared);
}

/**
 * Knowledge Base retrieval, recorded per grant and replayed by exact request. Chat queries are
 * written by the model and vary run to run, so a replay miss falls back to the recorded request
 * with the same filter whose query shares the most words, and counts as a miss.
 */
export function retrieval(file, mode) {
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const stats = { exact: 0, nearest: 0, live: 0 };
  let dirty = false;
  const keyOf = (input) => sha({ query: input.retrievalQuery?.text, config: input.retrievalConfiguration ?? null });
  const filterOf = (input) => sha(input.retrievalConfiguration ?? null);

  async function route(command, send) {
    const input = command.input;
    const key = keyOf(input);
    if (mode !== "replay") {
      const res = await send();
      stats.live++;
      if (mode === "record") {
        saved[key] = { query: input.retrievalQuery?.text, filter: filterOf(input), retrievalResults: res.retrievalResults ?? [] };
        dirty = true;
      }
      return res;
    }
    if (saved[key]) {
      stats.exact++;
      return { retrievalResults: saved[key].retrievalResults };
    }
    const asked = words(input.retrievalQuery?.text);
    const candidates = Object.values(saved).filter((r) => r.filter === filterOf(input));
    if (candidates.length === 0) {
      throw new Error(`eval: no recorded retrieval in ${file} for this filter; run with --retrieval record`);
    }
    const best = candidates.reduce((a, b) => (overlap(asked, words(b.query)) > overlap(asked, words(a.query)) ? b : a));
    stats.nearest++;
    return { retrievalResults: best.retrievalResults };
  }

  function save() {
    if (!dirty) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`);
    dirty = false;
  }

  return { route, save, stats };
}

/** An S3 GetObject body that both readS3Text (async iteration) and transformToString accept. */
export function s3Body(text) {
  const buf = Buffer.from(text, "utf8");
  return {
    async *[Symbol.asyncIterator]() {
      yield buf;
    },
    transformToString: async () => buf.toString("utf8"),
  };
}

export function only(commandName, fn) {
  return (command, send, scope) => {
    if (command.constructor.name !== commandName) {
      throw new Error(`eval: unexpected ${command.constructor.name} (only ${commandName} is routed)`);
    }
    return fn(command, send, scope);
  };
}
