// What the Lambda layer provides at /opt/nodejs; vitest.lambda.config.ts aliases the same file.
const SHARED = new URL(
  "../../lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/index.mjs",
  import.meta.url
).href;

export async function resolve(specifier, context, next) {
  return specifier === "grantwell-shared" ? { url: SHARED, shortCircuit: true } : next(specifier, context);
}
