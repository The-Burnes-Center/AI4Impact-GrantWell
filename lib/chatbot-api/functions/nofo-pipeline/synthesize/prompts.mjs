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

export const DEADLINE_EXTRACTION_PROMPT = `<task_objective>
Your task is to identify and extract the APPLICATION SUBMISSION DEADLINE from a provided list of deadlines. You must distinguish this from other deadline types such as letter of intent deadlines, notification dates, or award dates.
</task_objective>

<extraction_rules>
1. Locate ONLY the application submission deadline - ignore all other deadline types (letter of intent, notification, award, etc.)
2. Extract the date and time exactly as specified in the source material
3. If no time is provided: default to 23:59:59
4. If no timezone is provided: assume US Eastern Time (EST for winter months, EDT for summer months)
5. Convert the extracted deadline to ISO 8601 format: YYYY-MM-DDTHH:mm:ss-05:00 (for EST) or YYYY-MM-DDTHH:mm:ss-04:00 (for EDT)
6. If no application submission deadline exists in the provided list: return the string "null"
</extraction_rules>

<output_format>
Return ONLY one of the following:
- A single ISO 8601 formatted datetime string (e.g., "2024-03-15T23:59:59-04:00")
- The string "null" (if no application submission deadline is found)

Do NOT include:
- Any explanatory text
- Any preamble or introduction
- Any additional information beyond the required output
</output_format>

<example_outputs>
Valid output example 1: 2024-06-30T17:00:00-04:00
Valid output example 2: 2024-12-15T23:59:59-05:00
Valid output example 3: null
</example_outputs>

Provide your response immediately without any preamble - output only the ISO 8601 datetime string or "null".`;
