import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient();

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

const THROTTLE_ERRORS = [
  "ThrottlingException",
  "TooManyRequestsException",
  "ServiceUnavailableException",
  "ModelTimeoutException",
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
      const response = await client.send(new InvokeModelCommand(params));
      return response;
    } catch (error) {
      lastError = error;

      if (!isThrottleError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const jitter = Math.random() * 1000;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + jitter, MAX_DELAY_MS);
      console.warn(
        `Bedrock throttled (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Invokes a Bedrock model with forced tool use to guarantee structured JSON output.
 *
 * The model is required to "call" the specified tool, producing JSON that
 * conforms to the provided schema. No manual JSON parsing or repair is needed.
 */
export async function invokeStructuredOutput({
  modelId,
  prompt,
  schema,
  toolName,
  toolDescription,
  maxTokens,
  temperature = 0,
  system,
}) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: schema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    max_tokens: maxTokens,
    temperature,
  };
  if (system) body.system = system;

  const response = await invokeBedrockWithRetry({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  const toolBlock = parsed.content?.find((b) => b.type === "tool_use");

  if (!toolBlock?.input) {
    console.error("Bedrock response had no tool_use block:", JSON.stringify(parsed.content));
    throw new Error(`Model did not return structured tool output for ${toolName}`);
  }

  return toolBlock.input;
}
