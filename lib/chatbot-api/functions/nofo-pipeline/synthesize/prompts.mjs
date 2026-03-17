export const MERGE_PROMPT = `You are a grant requirements synthesis specialist. You have multiple extraction results from different sections of a NOFO document. Merge them into a single comprehensive summary.

Rules:
- Deduplicate items that appear in multiple sections (keep the most detailed version)
- Combine related items where appropriate
- Preserve the original terminology from the NOFO
- Keep descriptions concise (2-3 sentences per item)
- Include relevant links in markdown format: [Link Text](URL)
- Extract the official grant name from the data

Return ONLY this JSON structure:
{
  "GrantName": "Complete official grant title",
  "EligibilityCriteria": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high|medium|low", "sourceQuote": "quote"}
  ],
  "RequiredDocuments": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high|medium|low", "sourceQuote": "quote"}
  ],
  "ProjectNarrativeSections": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high|medium|low", "sourceQuote": "quote"}
  ],
  "KeyDeadlines": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high|medium|low", "sourceQuote": "quote"}
  ]
}`;

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
