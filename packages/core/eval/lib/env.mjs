import fs from "node:fs";

const FUNCTIONS_TS = new URL("../../lib/chatbot-api/functions/functions.ts", import.meta.url);

/** The model ids the deployed Lambdas get, read from the CDK source so the eval can't drift from it. */
export function deployedModels() {
  const src = fs.readFileSync(FUNCTIONS_TS, "utf8");
  const read = (name) => {
    const id = src.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
    if (!id) throw new Error(`eval: ${name} not found in functions.ts`);
    return id;
  };
  return { sonnet: read("SONNET_MODEL_ID"), haiku: read("HAIKU_MODEL_ID") };
}

/** Must run before any handler is imported: the handlers read these at module load. */
export function configure({ kbId } = {}) {
  const models = deployedModels();
  for (const name of ["NOFO_METADATA_TABLE_NAME", "DAILY_USAGE_TABLE_NAME", "USER_DOCUMENTS_BUCKET", "NOFO_STATE_FILTER_ENABLED", "SUPPORTED_STATES"]) {
    delete process.env[name];
  }
  Object.assign(process.env, {
    AWS_REGION: process.env.AWS_REGION || "us-east-1",
    SONNET_MODEL_ID: models.sonnet,
    HAIKU_MODEL_ID: models.haiku,
    KB_ID: kbId || "eval-replay",
    BUCKET: "eval-nofos",
    DRAFT_GENERATION_JOBS_TABLE_NAME: "eval-draft-jobs",
    WEBSOCKET_API_ENDPOINT: "https://eval.invalid",
    SESSION_HANDLER: "eval-session-handler",
    USER_POOL_ID: "eval-user-pool",
  });
  return models;
}
