export const QUESTION_GENERATION_PROMPT = `Analyze the NOFO summary and generate 5-15 strategic questions (ideally 8-10) to guide grant proposal development.

**Question Criteria:**
- Address all critical Project Narrative requirements and evaluation criteria
- Target distinct aspects; use clear, non-technical language
- Prompt concrete evidence and specific details
- Focus on high-point-value sections
- Use the NOFO's exact terminology

**Question Format:**
- Start with action phrases: "How will you...", "Describe your...", "What evidence..."
- Concise (1-3 sentences), avoid yes/no questions
- Reference specific NOFO requirements

Return ONLY this JSON:
{
  "totalQuestions": [number],
  "questions": [
    {"id": 1, "question": "[question text]"}
  ]
}`;

export const DEADLINE_EXTRACTION_PROMPT = `Extract the APPLICATION SUBMISSION DEADLINE from these deadlines (not letter of intent, notification, or award dates):

Rules:
1. Extract the date and time as specified
2. If time missing: use 23:59:59
3. If timezone missing: assume US Eastern Time (EST/EDT)
4. Return in ISO 8601: YYYY-MM-DDTHH:mm:ss-05:00 (EST) or -04:00 (EDT)
5. Return "null" if no application deadline found

Output only the ISO date string or "null" - no explanation.`;
