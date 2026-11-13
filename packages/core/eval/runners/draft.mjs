import fs from "node:fs";
import path from "node:path";
import { inScope, only, s3Body, withStage } from "../lib/aws.mjs";
import { readOptional } from "../lib/golden.mjs";
import { pool } from "../lib/pool.mjs";

const DRAFT = new URL("../../lib/chatbot-api/functions/draft-pipeline/", import.meta.url);

// The draft state machine's Map maxConcurrency.
const MAP_CONCURRENCY = 5;

/**
 * prepare, the plan step, then generate-section per drafted section, summaries last. draft.json
 * holds the applicant's inputs {query, projectBasics, questionnaireAnswers, questions?,
 * additionalInfo, userState, sections?}; without sections the outline is the summary's
 * ProjectNarrativeSections.
 */
export async function draft(grant, { summary, retrieval }) {
  const input = readOptional(grant, "draft.json");
  if (!input) throw new Error(`eval: ${grant.slug} has no draft.json`);
  const sections = input.sections ?? summary?.ProjectNarrativeSections;
  const { handler: prepare } = await import(new URL("prepare/index.mjs", DRAFT).href);
  const { handler: generateSection } = await import(new URL("generate-section/index.mjs", DRAFT).href);

  const content = {};
  const skipped = {};
  const trimmed = {};
  let summarySectionIds = [];
  const rawTextPath = path.join(grant.dir, "source", "raw.txt");
  const routes = {
    // generate-section reads the grant's raw-text.txt (its summary when that's missing); prepare reads summary.json.
    s3: only("GetObjectCommand", (command) => {
      if (command.input.Key?.endsWith("/raw-text.txt")) {
        if (!fs.existsSync(rawTextPath)) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: s3Body(fs.readFileSync(rawTextPath, "utf8")) };
      }
      return { Body: s3Body(JSON.stringify({ ...summary, ProjectNarrativeSections: sections ?? [] })) };
    }),
    dynamodb: (command) => {
      const kind = command.constructor.name;
      if (kind === "GetItemCommand") {
        // The job row a summary reads its drafted sections from; there is no saved application.
        if (command.input.TableName !== process.env.DRAFT_GENERATION_JOBS_TABLE_NAME) return {};
        return {
          Item: {
            sections: { M: Object.fromEntries(Object.entries(content).map(([id, text]) => [id, { S: text }])) },
            summarySectionIds: { L: summarySectionIds.map((id) => ({ S: id })) },
          },
        };
      }
      if (kind !== "UpdateItemCommand") throw new Error(`eval: no route for dynamodb ${kind}`);
      const values = command.input.ExpressionAttributeValues ?? {};
      const names = command.input.ExpressionAttributeNames ?? {};
      const id = names["#sectionId"] ?? names["#sectionName"];
      if (values[":content"]) content[id] = values[":content"].S;
      if (values[":note"]) skipped[id] = values[":note"].S;
      if (values[":trimmed"]) trimmed[id] = { unit: values[":trimmed"].M.unit.S, max: Number(values[":trimmed"].M.max.N) };
      if (values[":sk"]) for (const [sid, v] of Object.entries(values[":sk"].M ?? {})) skipped[sid] = v.S;
      if (values[":ss"]) summarySectionIds = values[":ss"].L.map((v) => v.S);
      return {};
    },
    kb: retrieval.route,
  };

  return inScope(routes, async () => {
    const prepared = await prepare({
      jobId: `eval-${grant.slug}`,
      query: input.query ?? "",
      documentIdentifier: `${grant.name}/`,
      projectBasics: input.projectBasics,
      // Releases before 3.3 read the answers from questionnaire; 3.3 reads questionnaireAnswers and ignores this.
      questionnaire: input.questionnaire ?? input.questionnaireAnswers,
      questionnaireAnswers: input.questionnaireAnswers,
      questions: input.questions,
      additionalInfo: input.additionalInfo,
      sessionId: `eval-${grant.slug}`,
      userId: input.userId,
      userState: input.userState,
    });
    // Releases before the plan step have no planner; prepare's split stands.
    const job = await withStage("plan", () => generateSection({ step: "plan", state: prepared })).catch(() => prepared);
    // Everything the state holds except the section lists, as the Map item selector passes it on.
    const { sections: _items, warmSections, remainingSections, summarySections = [], ...shared } = job;
    const errors = {};
    const write = (sectionItem) =>
      withStage(`draft:${sectionItem.id ?? sectionItem.item}`, () => generateSection({ ...shared, sectionItem })).catch((e) => {
        errors[sectionItem.id ?? sectionItem.item] = `${e.name}: ${e.message}`;
      });
    await pool([...warmSections, ...remainingSections], MAP_CONCURRENCY, write);
    await pool(summarySections, MAP_CONCURRENCY, write);
    return {
      noMaterial: Boolean(job.noMaterial),
      // Releases before 3.3 return no outline and no section ids; generate-section then keys by name.
      sections: (job.outline ?? job.sections.map((s) => ({ id: s.id, name: s.item }))).map(({ id, name }) => {
        const key = id ?? name;
        return {
          id: key,
          name,
          content: content[key] ?? null,
          words: content[key] ? content[key].split(/\s+/).filter(Boolean).length : 0,
          ...(skipped[key] && { skipped: skipped[key] }),
          ...(trimmed[key] && { trimmed: trimmed[key] }),
          ...(errors[key] && { error: errors[key] }),
        };
      }),
    };
  });
}
