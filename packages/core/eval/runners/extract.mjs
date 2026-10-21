import fs from "node:fs";
import { inScope, only, s3Body, withStage } from "../lib/aws.mjs";

const PIPELINE = new URL("../../lib/chatbot-api/functions/nofo-pipeline/", import.meta.url);

/** extract-and-analyze then synthesize, as the NOFO state machine chains them. */
export async function extract(grant) {
  const { handler: analyze } = await import(new URL("extract-and-analyze/index.mjs", PIPELINE).href);
  const { handler: synthesize } = await import(new URL("synthesize/index.mjs", PIPELINE).href);
  const raw = fs.readFileSync(grant.rawPath, "utf8");
  const routes = { s3: only("GetObjectCommand", () => ({ Body: s3Body(raw) })) };

  return inScope(routes, async () => {
    const event = { s3Bucket: process.env.BUCKET, rawTextKey: `${grant.name}/raw-text.txt`, nofoName: grant.name };
    const analyzed = await withStage("extract", () => analyze(event));
    const synthesized = await withStage("synthesize", () => synthesize(analyzed));
    return {
      summary: synthesized.mergedSummary,
      questions: synthesized.questionsData,
      applicationDeadline: synthesized.applicationDeadline,
      failedChunks: analyzed.failedChunks ?? [],
    };
  });
}
