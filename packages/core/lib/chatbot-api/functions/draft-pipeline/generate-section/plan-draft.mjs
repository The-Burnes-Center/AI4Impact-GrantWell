/**
 * The step between prepare and the writers: decides which sections are drafted (material-match.mjs),
 * records the plan on the job row, and returns the pipeline state with the sections split into the
 * Map inputs. Runs in the generate-section function so it reads the applicant's documents exactly as
 * the writers will.
 */

import {
  fallbackPlan,
  matchRequest,
  numberedQuestions,
  parseMatch,
  planSections,
  SUMMARY_TITLE,
} from './material-match.mjs';

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

/** deps: { askMatcher(request), loadDocuments(), readSavedSections(), saveJobPlan(plan) } */
export async function planDraft(state, deps) {
  const sections = Array.isArray(state.sections) ? state.sections : [];
  let plan;
  try {
    const [documents, saved] = await Promise.all([deps.loadDocuments(), deps.readSavedSections()]);
    const inRun = new Set(sections.map((s) => s.id));
    const priorMain = (state.outline || []).some(
      (s) => !inRun.has(s.id) && !SUMMARY_TITLE.test(s.name || '') && (hasText(saved[s.id]) || hasText(saved[s.name]))
    );
    const request = matchRequest({
      sections,
      questions: numberedQuestions(state),
      projectBasics: state.projectBasics,
      additionalInfo: state.additionalInfo,
      documents,
    });
    const verdicts = parseMatch(await deps.askMatcher(request), sections);
    plan = planSections(sections, verdicts, { priorMain });
    for (const s of sections) {
      const v = verdicts.get(s.id);
      console.log(`Plan: "${s.item}" summary=${v.summary} material=${v.material} sources=${JSON.stringify(v.sources)}`);
    }
  } catch (error) {
    console.warn(`Plan: the material check failed (${error?.name}: ${error?.message}); drafting every section`);
    plan = fallbackPlan(sections);
  }

  const drafting = [...plan.warmSections, ...plan.remainingSections, ...plan.summarySections];
  console.log(
    `Plan: job ${state.jobId} drafts ${drafting.length} of ${sections.length} sections` +
      (Object.keys(plan.sectionsSkipped).length ? `; skips ${Object.keys(plan.sectionsSkipped).join(', ')}` : '')
  );
  await deps.saveJobPlan({
    sectionNames: sections.map((s) => s.item),
    sectionIds: sections.map((s) => s.id),
    totalSections: drafting.length,
    sectionsSkipped: plan.sectionsSkipped,
    summarySectionIds: plan.summarySections.map((s) => s.id),
  });

  return { ...state, ...plan };
}
