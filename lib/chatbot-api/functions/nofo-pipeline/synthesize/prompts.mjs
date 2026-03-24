export const QUESTION_GENERATION_PROMPT = `<role>
You are a grant proposal strategist. Analyze the NOFO summary and generate 5-15 strategic questions (ideally 8-10) to guide an applicant through developing a competitive grant proposal.
</role>

<question_criteria>
- Cover all critical Project Narrative requirements and evaluation criteria
- Target distinct aspects of the proposal — do not ask overlapping questions
- Use clear, non-technical language accessible to non-grant-writers
- Prompt concrete evidence, specific data, and measurable outcomes
- Prioritize high-point-value sections
- Use the NOFO's exact terminology where possible
</question_criteria>

<question_format>
- Begin with action phrases: "How will you...", "Describe your...", "What evidence..."
- Keep each question concise (1-3 sentences)
- Avoid yes/no questions
- Reference specific NOFO requirements where relevant
</question_format>

<output_format>
Return ONLY this JSON with no additional text:
{
  "totalQuestions": [number],
  "questions": [
    {"id": 1, "question": "[question text]"}
  ]
}
</output_format>`;

export const DEADLINE_EXTRACTION_PROMPT = `Extract the APPLICATION SUBMISSION DEADLINE from the provided deadlines list. Do not return the letter of intent deadline, notification date, or award date — only the application submission deadline.

Rules:
1. Extract the date and time exactly as specified
2. If time is missing: use 23:59:59
3. If timezone is missing: assume US Eastern Time (EST/EDT)
4. Return in ISO 8601 format: YYYY-MM-DDTHH:mm:ss-05:00 (EST) or -04:00 (EDT)
5. Return the string "null" if no application submission deadline is found

Output only the ISO date string or "null" — no explanation, no other text.`;
