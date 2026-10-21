import { inScope, only, s3Body, withStage } from "../lib/aws.mjs";
import { readOptional } from "../lib/golden.mjs";
import { pool } from "../lib/pool.mjs";

const DRAFT = new URL("../../lib/chatbot-api/functions/draft-pipeline/", import.meta.url);

// The draft state machine's Map itemSelector and maxConcurrency.
const MAP_FIELDS = [
  "jobId", "query", "documentIdentifier", "projectBasics", "questionnaire", "questionnaireAnswers",
  "additionalInfo", "sessionId", "userId", "userState", "totalSections", "sectionNames",
];
const MAP_CONCURRENCY = 5;

/**
 * prepare, then generate-section per section. draft.json holds the applicant's inputs
 * {query, projectBasics, questionnaireAnswers, additionalInfo, userState, sections?}; without
 * sections the outline is the summary's ProjectNarrativeSections.
 */
export async function draft(grant, { summary, retrieval }) {
  const input = readOptional(grant, "draft.json");
  if (!input) throw new Error(`eval: ${grant.slug} has no draft.json`);
  const sections = input.sections ?? summary?.ProjectNarrativeSections;
  const { handler: prepare } = await import(new URL("prepare/index.mjs", DRAFT).href);
  const { handler: generateSection } = await import(new URL("generate-section/index.mjs", DRAFT).href);

  const content = {};
  const routes = {
    s3: only("GetObjectCommand", () => ({ Body: s3Body(JSON.stringify({ ProjectNarrativeSections: sections ?? [] })) })),
    dynamodb: only("UpdateItemCommand", (command) => {
      const saved = command.input.ExpressionAttributeValues?.[":content"];
      if (saved) content[command.input.ExpressionAttributeNames["#sectionId"]] = saved.S;
      return {};
    }),
    kb: retrieval.route,
  };

  return inScope(routes, async () => {
    const job = await prepare({
      jobId: `eval-${grant.slug}`,
      query: input.query ?? "",
      documentIdentifier: `${grant.name}/`,
      projectBasics: input.projectBasics,
      questionnaire: input.questionnaire,
      questionnaireAnswers: input.questionnaireAnswers,
      additionalInfo: input.additionalInfo,
      sessionId: `eval-${grant.slug}`,
      userId: input.userId,
      userState: input.userState,
    });
    const shared = Object.fromEntries(MAP_FIELDS.map((k) => [k, job[k]]));
    const errors = {};
    await pool(job.sections, MAP_CONCURRENCY, (sectionItem) =>
      withStage(`draft:${sectionItem.id}`, () => generateSection({ ...shared, sectionItem })).catch((e) => {
        errors[sectionItem.id] = `${e.name}: ${e.message}`;
      })
    );
    return {
      sections: job.outline.map(({ id, name }) => ({
        id,
        name,
        content: content[id] ?? null,
        words: content[id] ? content[id].split(/\s+/).filter(Boolean).length : 0,
        ...(errors[id] && { error: errors[id] }),
      })),
    };
  });
}
