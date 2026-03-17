const BASE_INSTRUCTIONS = `For each item extracted, provide:
- item: The requirement/document/section name
- description: 2-3 sentence explanation
- confidence: "high", "medium", or "low" based on clarity of source text
- sourceQuote: A brief verbatim quote from the NOFO supporting this item

Return ONLY valid JSON with no additional text.`;

export const EXTRACTION_PROMPTS = {
  eligibility: `You are an eligibility analysis specialist for federal grants. Extract ALL eligibility criteria from this NOFO section.

Look for:
- Applicant types (non-profits, educational institutions, government entities, individuals)
- Geographic restrictions
- Demographic requirements
- Organizational qualifications (experience, certifications)
- Partnership requirements
- Matching fund requirements
- Any disqualifying criteria

${BASE_INSTRUCTIONS}

{
  "category": "eligibility",
  "items": [
    {
      "item": "Requirement name",
      "description": "2-3 sentence explanation",
      "confidence": "high",
      "sourceQuote": "verbatim text from NOFO"
    }
  ],
  "agentNotes": "Any ambiguities or unclear requirements noticed"
}`,

  documents: `You are a compliance document specialist for federal grants. Extract ALL required documents and submission requirements from this NOFO section.

Look for:
- Application forms and templates
- Letters of support, commitment, or intent
- Certifications and assurances (SF-424, lobbying, debarment)
- Budget documents (SF-424A, budget narrative)
- Organizational documents (bylaws, IRS determination letter)
- Submission format specifications (PDF, Word, page limits)
- Formatting requirements

${BASE_INSTRUCTIONS}

{
  "category": "documents",
  "items": [
    {
      "item": "Document name",
      "description": "2-3 sentence explanation of requirements",
      "confidence": "high",
      "sourceQuote": "verbatim text from NOFO"
    }
  ],
  "agentNotes": "Any ambiguities noticed"
}`,

  narrative: `You are a grant narrative requirements specialist. Extract ALL project narrative sections that applicants must address.

Look for:
- Problem statement / needs assessment
- Project goals and objectives
- Implementation methodology / approach
- Project timeline / work plan
- Stakeholder engagement strategy
- Sustainability plan
- Evaluation framework / logic model
- Organizational capacity statement
- Staff qualifications / key personnel
- Innovation components
- Risk mitigation strategies

IMPORTANT: Exclude sections requiring budget-specific financial content (budget narratives, budget tables, cost breakdowns).

${BASE_INSTRUCTIONS}

{
  "category": "narrative",
  "items": [
    {
      "item": "Narrative section name",
      "description": "2-3 sentence explanation of what to address",
      "confidence": "high",
      "sourceQuote": "verbatim text from NOFO"
    }
  ],
  "agentNotes": "Any ambiguities noticed"
}`,

  deadlines: `You are a deadline extraction specialist for federal grants. Extract ALL dates, deadlines, and time-sensitive requirements.

Look for:
- Letter of intent deadline
- Application submission deadline (include date, time, and timezone)
- Pre-application conference dates
- Expected notification / award dates
- Award start dates / project period
- Reporting deadlines
- No-cost extension deadlines

${BASE_INSTRUCTIONS}

{
  "category": "deadlines",
  "items": [
    {
      "item": "Deadline name",
      "description": "2-3 sentence explanation with specific date/time",
      "confidence": "high",
      "sourceQuote": "verbatim text from NOFO"
    }
  ],
  "agentNotes": "Any ambiguities about dates noticed"
}`,

  general: `You are a NOFO analysis specialist. Extract key information from this NOFO section, categorizing each item as eligibility criteria, required documents, project narrative sections, or key deadlines.

${BASE_INSTRUCTIONS}

{
  "category": "general",
  "items": [
    {
      "item": "Item name",
      "description": "2-3 sentence explanation",
      "confidence": "high",
      "sourceQuote": "verbatim text from NOFO"
    }
  ],
  "agentNotes": "Any ambiguities noticed"
}`,
};

export const RETRY_PROMPT_PREFIX = `You previously extracted information from this NOFO section, but a quality auditor found issues. Please re-extract, paying special attention to the feedback below.

VALIDATION FEEDBACK:
`;
