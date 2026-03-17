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
