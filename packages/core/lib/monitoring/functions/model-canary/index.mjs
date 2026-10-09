/**
 * One minimal call to every Bedrock model and inference profile this deployment uses, through the
 * same IDs the app passes. Runs daily and after every deploy; throws if any model fails, so both
 * the alarm and the deploy step see it.
 */
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockAgentRuntimeClient, RerankCommand } from "@aws-sdk/client-bedrock-agent-runtime";

/** Pinned in LOG_MARKERS.modelCanaryFailed: rewording it disarms the alarm. */
export const FAILURE_MARKER = "Model canary failed for";
const MAX_MESSAGE_CHARS = 300;

export function commandFor(model) {
  switch (model.kind) {
    case "anthropic":
      return {
        client: "runtime",
        command: new InvokeModelCommand({
          modelId: model.modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1,
            messages: [{ role: "user", content: [{ type: "text", text: "Reply OK." }] }],
          }),
        }),
      };
    case "titan-embed":
      return {
        client: "runtime",
        command: new InvokeModelCommand({
          modelId: model.modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({ inputText: "ok" }),
        }),
      };
    case "rerank":
      return {
        client: "agent",
        command: new RerankCommand({
          queries: [{ type: "TEXT", textQuery: { text: "ok" } }],
          sources: [{ type: "INLINE", inlineDocumentSource: { type: "TEXT", textDocument: { text: "ok" } } }],
          rerankingConfiguration: {
            type: "BEDROCK_RERANKING_MODEL",
            bedrockRerankingConfiguration: { numberOfResults: 1, modelConfiguration: { modelArn: model.modelId } },
          },
        }),
      };
    default:
      throw new Error(`Unknown model kind "${model.kind}"`);
  }
}

export async function probe(model, clients) {
  try {
    const { client, command } = commandFor(model);
    await clients[client].send(command);
    return { model: model.label, modelId: model.modelId, ok: true };
  } catch (error) {
    return {
      model: model.label,
      modelId: model.modelId,
      ok: false,
      errorName: error?.name ?? "Error",
      message: String(error?.message ?? error).split("\n")[0].slice(0, MAX_MESSAGE_CHARS),
    };
  }
}

export async function runCanary(models, clients) {
  if (!Array.isArray(models) || models.length === 0) throw new Error("MODELS lists no models to check");
  const results = await Promise.all(models.map((model) => probe(model, clients)));
  return { ok: results.every((r) => r.ok), results };
}

export function failureLines(summary) {
  return summary.results
    .filter((r) => !r.ok)
    .map((r) => `${FAILURE_MARKER} ${r.model} (${r.modelId}): ${r.errorName}: ${r.message}`);
}

export async function check(models, clients) {
  const summary = await runCanary(models, clients);
  const failures = failureLines(summary);
  for (const line of failures) console.error(line);
  console.log(JSON.stringify(summary));
  if (!summary.ok) {
    throw new Error(`${failures.length} of ${summary.results.length} Bedrock models failed:\n${failures.join("\n")}`);
  }
  return summary;
}

const clients = { runtime: new BedrockRuntimeClient({}), agent: new BedrockAgentRuntimeClient({}) };

export const handler = async () => check(JSON.parse(process.env.MODELS ?? "[]"), clients);
