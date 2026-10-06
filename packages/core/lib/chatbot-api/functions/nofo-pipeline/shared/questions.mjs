import { invokeStructuredOutput } from "./bedrock.mjs";
import { validateQuestions, SUMMARY_ARRAY_FIELDS } from "./json.mjs";
import { QUESTIONS_SCHEMA } from "./schemas.mjs";

export const QUESTION_GENERATION_PROMPT = `<role>
You are a grant proposal strategist. Analyze the NOFO summary and generate 5-15 strategic questions (ideally 8-10) to guide an applicant through developing a competitive grant proposal.
</role>

<rules>
- Cover all critical Project Narrative requirements and evaluation criteria, prioritizing high-point-value sections
- Each question must target a distinct aspect — no overlapping questions
- Use clear, non-technical language accessible to non-grant-writers
- Prompt concrete evidence, specific data, and measurable outcomes
- Use the NOFO's exact terminology and reference specific requirements where relevant
- Begin with action phrases: "How will you...", "Describe your...", "What evidence..."
- 1-3 sentences per question. No yes/no questions.
</rules>

<output>
Return ONLY this JSON with no additional text:
{
  "totalQuestions": [number],
  "questions": [
    {"id": 1, "question": "[question text]"}
  ]
}
</output>`;

export const DOCUMENT_SAMPLE_CHARS = 30000;

export function hasQuestions(questionsData) {
  return Array.isArray(questionsData?.questions) && questionsData.questions.length > 0;
}

export function documentSampleOf(rawText) {
  if (!rawText) return "";
  return rawText.length > DOCUMENT_SAMPLE_CHARS
    ? rawText.substring(0, DOCUMENT_SAMPLE_CHARS) + "\n\n[Truncated...]"
    : rawText;
}

function hasSummaryContent(summary) {
  return SUMMARY_ARRAY_FIELDS.some((cat) => summary?.[cat]?.length > 0);
}

export async function generateQuestions(summary, documentSample) {
  try {
    if (!hasSummaryContent(summary)) return null;

    const prompt = `${QUESTION_GENERATION_PROMPT}\n\n<summary>\n${JSON.stringify(summary, null, 2)}\n</summary>\n\n<nofo_sample>\n${documentSample}\n</nofo_sample>`;

    const parsed = await invokeStructuredOutput({
      modelId: process.env.HAIKU_MODEL_ID,
      prompt,
      schema: QUESTIONS_SCHEMA,
      toolName: "save_questions",
      toolDescription: "Save the generated strategic questions for the NOFO",
      maxTokens: 2000,
      temperature: 0.1,
    });

    const validation = validateQuestions(parsed);

    if (hasQuestions(validation.data)) {
      if (validation.errors.length > 0) {
        console.warn("Questions validation issues:", validation.errors);
      }
      return validation.data;
    }
    return null;
  } catch (error) {
    console.error("Error generating questions:", error);
    return null;
  }
}

export async function generateQuestionsWithRetry(summary, documentSample, attempts = 2) {
  if (!hasSummaryContent(summary)) return null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const questions = await generateQuestions(summary, documentSample);
    if (questions) return questions;
    if (attempt < attempts) {
      console.warn(`Question generation returned nothing (attempt ${attempt}/${attempts}), retrying`);
    }
  }
  return null;
}
