export const EXTRACTION_PROMPT = `You are a federal grant NOFO analysis specialist. Extract ALL key requirements from this Notice of Funding Opportunity (NOFO) into a structured summary covering four categories.

## ELIGIBILITY CRITERIA
Extract ALL eligibility requirements:
- Applicant types (non-profits, educational institutions, government entities, individuals)
- Geographic restrictions
- Demographic requirements
- Organizational qualifications (experience, certifications)
- Partnership requirements
- Matching fund requirements
- Any disqualifying criteria

## REQUIRED DOCUMENTS
Extract ALL required documents and submission requirements:
- Application forms and templates
- Letters of support, commitment, or intent
- Certifications and assurances (SF-424, lobbying, debarment)
- Budget documents (SF-424A, budget narrative)
- Organizational documents (bylaws, IRS determination letter)
- Submission format specifications (PDF, Word, page limits)
- Formatting requirements

## PROJECT NARRATIVE SECTIONS
Extract ALL project narrative sections that applicants must address:
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

IMPORTANT: Exclude budget-specific financial content (budget narratives, budget tables, cost breakdowns).

## KEY DEADLINES
Extract ALL dates, deadlines, and time-sensitive requirements:
- Letter of intent deadline
- Application submission deadline (include date, time, and timezone)
- Pre-application conference dates
- Expected notification / award dates
- Award start dates / project period
- Reporting deadlines
- No-cost extension deadlines

## OUTPUT INSTRUCTIONS
For each item provide:
- item: The requirement/document/section name
- description: 2-3 sentence explanation
- confidence: "high", "medium", or "low" based on clarity of source text
- sourceQuote: A brief verbatim quote from the NOFO supporting this item

Return ONLY valid JSON with no additional text:
{
  "GrantName": "Complete official grant title",
  "EligibilityCriteria": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high", "sourceQuote": "verbatim quote"}
  ],
  "RequiredDocuments": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high", "sourceQuote": "verbatim quote"}
  ],
  "ProjectNarrativeSections": [
    {"item": "Name", "description": "2-3 sentence explanation", "confidence": "high", "sourceQuote": "verbatim quote"}
  ],
  "KeyDeadlines": [
    {"item": "Name", "description": "2-3 sentence explanation with specific date/time", "confidence": "high", "sourceQuote": "verbatim quote"}
  ]
}`;

export const RETRY_PROMPT_PREFIX = `You previously extracted information from this NOFO, but a quality auditor found issues. Please re-extract, paying special attention to the feedback below.

VALIDATION FEEDBACK:
`;
