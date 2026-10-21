import { inScope, only, s3Body, withStage } from "../lib/aws.mjs";
import { readOptional } from "../lib/golden.mjs";
import { pool } from "../lib/pool.mjs";

const DRAFT = new URL("../../lib/chatbot-api/functions/draft-pipeline/", import.meta.url);

// The draft state machine's Map maxConcurrency.
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
      const names = command.input.ExpressionAttributeNames ?? {};
      if (saved) content[names["#sectionId"] ?? names["#sectionName"]] = saved.S;
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
      // Releases before 3.3 read the answers from questionnaire; 3.3 reads questionnaireAnswers and ignores this.
      questionnaire: input.questionnaire ?? input.questionnaireAnswers,
      questionnaireAnswers: input.questionnaireAnswers,
      additionalInfo: input.additionalInfo,
      sessionId: `eval-${grant.slug}`,
      userId: input.userId,
      userState: input.userState,
    });
    // Everything prepare returns except the section list, as each release's Map item selector passes it on.
    const { sections: _items, outline: _outline, ...shared } = job;
    const errors = {};
    await pool(job.sections, MAP_CONCURRENCY, (sectionItem) =>
      withStage(`draft:${sectionItem.id ?? sectionItem.item}`, () => generateSection({ ...shared, sectionItem })).catch((e) => {
        errors[sectionItem.id ?? sectionItem.item] = `${e.name}: ${e.message}`;
      })
    );
    return {
      // Releases before 3.3 return no outline and no section ids; generate-section then keys by name.
      sections: (job.outline ?? job.sections.map((s) => ({ id: s.id, name: s.item }))).map(({ id, name }) => {
        const key = id ?? name;
        return {
          id: key,
          name,
          content: content[key] ?? null,
          words: content[key] ? content[key].split(/\s+/).filter(Boolean).length : 0,
          ...(errors[key] && { error: errors[key] }),
        };
      }),
    };
  });
}
