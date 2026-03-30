/**
 * JSON Schemas for Bedrock structured output (tool use).
 *
 * Each schema is used as a tool's input_schema to force the model
 * to return valid JSON conforming to the defined structure.
 */

const SUMMARY_ITEM_SCHEMA = {
  type: "object",
  properties: {
    item: { type: "string", description: "Requirement/document/section name" },
    description: { type: "string", description: "2-3 sentence explanation" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Confidence based on clarity of source text",
    },
    sourceQuote: {
      type: "string",
      description: "Brief verbatim quote from the NOFO supporting this item",
    },
  },
  required: ["item", "description", "confidence", "sourceQuote"],
};

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    EligibilityCriteria: {
      type: "array",
      items: SUMMARY_ITEM_SCHEMA,
      description: "All eligibility requirements",
    },
    RequiredDocuments: {
      type: "array",
      items: SUMMARY_ITEM_SCHEMA,
      description: "All required documents and submission requirements",
    },
    ProjectNarrativeSections: {
      type: "array",
      items: SUMMARY_ITEM_SCHEMA,
      description: "All project narrative sections applicants must address",
    },
    KeyDeadlines: {
      type: "array",
      items: SUMMARY_ITEM_SCHEMA,
      description: "All dates, deadlines, and time-sensitive requirements",
    },
  },
  required: [
    "EligibilityCriteria",
    "RequiredDocuments",
    "ProjectNarrativeSections",
    "KeyDeadlines",
  ],
};

export const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    totalQuestions: {
      type: "number",
      description: "Total number of questions generated",
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          question: { type: "string" },
        },
        required: ["id", "question"],
      },
    },
  },
  required: ["totalQuestions", "questions"],
};
