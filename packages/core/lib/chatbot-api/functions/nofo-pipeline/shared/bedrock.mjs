import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient();

// Room for up to 16K output tokens including adaptive thinking; the Lambda timeouts still bound it.
const REQUEST_TIMEOUT_MS = 300_000;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

const THROTTLE_ERRORS = [
  "ThrottlingException",
  "TooManyRequestsException",
  "ServiceUnavailableException",
  "ModelTimeoutException",
  "TimeoutError",
  "AbortError",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottleError(error) {
  return THROTTLE_ERRORS.some(
    (name) => error.name === name || error?.constructor?.name === name
  );
}

export async function invokeBedrockWithRetry(params) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.send(new InvokeModelCommand(params), {
        abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return response;
    } catch (error) {
      lastError = error;

      if (!isThrottleError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const jitter = Math.random() * 1000;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + jitter, MAX_DELAY_MS);
      console.warn(
        `Bedrock retry (attempt ${attempt + 1}/${MAX_RETRIES + 1}, reason=${error.name}), retrying in ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minProperties",
  "maxProperties",
]);
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "$defs", "definitions"]);
const SCHEMA_LIST_KEYWORDS = new Set(["anyOf", "allOf", "oneOf", "prefixItems"]);

export function toStrictSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toStrictSchema);
  if (!schema || typeof schema !== "object") return schema;

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key) || key === "additionalProperties") continue;
    if (SCHEMA_MAP_KEYWORDS.has(key)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, sub]) => [name, toStrictSchema(sub)])
      );
    } else if (SCHEMA_LIST_KEYWORDS.has(key) || key === "items" || key === "not") {
      out[key] = toStrictSchema(value);
    } else {
      out[key] = structuredClone(value);
    }
  }

  const types = Array.isArray(out.type) ? out.type : [out.type];
  if (types.includes("object") || out.properties) out.additionalProperties = false;
  return out;
}

function errorNamed(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

export async function invokeStructuredOutput({
  modelId,
  prompt,
  schema,
  toolName,
  toolDescription,
  maxTokens,
  effort,
  system,
}) {
  const instruction = toolDescription
    ? `${toolDescription.replace(/\.\s*$/, "")}.`
    : null;

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    output_config: {
      format: { type: "json_schema", schema: toStrictSchema(schema) },
      ...(effort && { effort }),
    },
  };

  const systemText = [system, instruction].filter(Boolean).join("\n\n");
  if (systemText) body.system = systemText;

  const response = await invokeBedrockWithRetry({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const parsed = JSON.parse(new TextDecoder().decode(response.body));

  if (parsed.stop_reason === "refusal") {
    throw errorNamed(
      "BedrockRefusalError",
      `Model refused ${toolName} (category: ${parsed.stop_details?.category ?? "unspecified"})`
    );
  }
  if (parsed.stop_reason === "max_tokens") {
    throw errorNamed(
      "BedrockTruncatedError",
      `Model output for ${toolName} was truncated at max_tokens=${maxTokens}`
    );
  }

  const textBlock = parsed.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    console.error("Bedrock response had no text block:", JSON.stringify(parsed.content));
    throw new Error(`Model did not return structured output for ${toolName}`);
  }

  try {
    return JSON.parse(textBlock.text);
  } catch (error) {
    throw new Error(`Model returned invalid JSON for ${toolName}: ${error.message}`);
  }
}
