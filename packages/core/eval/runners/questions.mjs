import fs from "node:fs";
import { inScope, withStage } from "../lib/aws.mjs";

const QUESTIONS = new URL("../../lib/chatbot-api/functions/nofo-pipeline/shared/questions.mjs", import.meta.url);

/**
 * Questions from a fixed summary, so they score apart from extraction. synthesize makes the same
 * two calls; going through it would also run deadline extraction.
 */
export async function questions(grant, { summary }) {
  if (!summary) throw new Error(`eval: no summary for ${grant.slug}; pass --from <extract run> or add summary.json`);
  const { documentSampleOf, generateQuestionsWithRetry } = await import(QUESTIONS.href);
  const raw = fs.readFileSync(grant.rawPath, "utf8");

  return inScope({}, () =>
    withStage("questions", async () => ({ questions: await generateQuestionsWithRetry(summary, documentSampleOf(raw)) }))
  );
}
