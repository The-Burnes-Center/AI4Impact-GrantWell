/**
 * Robust JSON extraction from Bedrock LLM responses with schema validation.
 *
 * Handles common LLM output quirks:
 *   - Markdown code fences (```json ... ```)
 *   - Leading/trailing prose around JSON
 *   - Trailing commas in arrays/objects
 *   - Single-line // comments
 */

export function extractJson(text) {
  if (!text || typeof text !== "string") return null;

  let cleaned = text.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try direct parse first (fastest path)
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // Greedy regex: first { to last }
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;

  let candidate = braceMatch[0];

  // Try as-is
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through
  }

  // Fix trailing commas: ,] or space,] or ,}
  candidate = candidate
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\/\/[^\n]*/g, "");

  try {
    return JSON.parse(candidate);
  } catch (error) {
    console.warn("JSON extraction failed after cleanup:", error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Schema validators — each returns { valid, data, errors }
// ---------------------------------------------------------------------------

function checkField(obj, field, type, errors, required = true) {
  if (obj[field] === undefined || obj[field] === null) {
    if (required) errors.push(`Missing required field: ${field}`);
    return;
  }
  if (type === "array") {
    if (!Array.isArray(obj[field])) {
      errors.push(`${field} must be an array, got ${typeof obj[field]}`);
    }
  } else if (typeof obj[field] !== type) {
    errors.push(`${field} must be ${type}, got ${typeof obj[field]}`);
  }
}

function checkArrayItems(arr, fieldName, requiredKeys, errors) {
  if (!Array.isArray(arr)) return;
  arr.forEach((item, i) => {
    if (typeof item !== "object" || item === null) {
      errors.push(`${fieldName}[${i}] must be an object`);
      return;
    }
    for (const key of requiredKeys) {
      if (item[key] === undefined || item[key] === null || item[key] === "") {
        errors.push(`${fieldName}[${i}] missing required key: ${key}`);
      }
    }
  });
}

export function validateMergedSummary(data) {
  const errors = [];
  if (!data) return { valid: false, data: null, errors: ["No data to validate"] };

  checkField(data, "GrantName", "string", errors, false);

  const arrayFields = [
    "EligibilityCriteria",
    "RequiredDocuments",
    "ProjectNarrativeSections",
    "KeyDeadlines",
  ];

  for (const field of arrayFields) {
    if (data[field] === undefined) {
      data[field] = [];
      errors.push(`Missing '${field}', defaulting to empty array`);
    } else if (!Array.isArray(data[field])) {
      errors.push(`'${field}' must be an array, got ${typeof data[field]}`);
      data[field] = [];
    } else {
      checkArrayItems(data[field], field, ["item", "description"], errors);
    }
  }

  if (!data.GrantName || !data.GrantName.trim()) {
    errors.push("GrantName is empty");
  }

  return { valid: errors.length === 0, data, errors };
}

export function validateValidationResult(data) {
  const errors = [];
  if (!data) return { valid: false, data: null, errors: ["No data to validate"] };

  const validVerdicts = ["PASS", "FAIL", "NEEDS_REVIEW"];
  if (!validVerdicts.includes(data.overallVerdict)) {
    errors.push(`Invalid overallVerdict: ${data.overallVerdict}`);
    data.overallVerdict = "NEEDS_REVIEW";
  }

  if (typeof data.qualityScore !== "number" || data.qualityScore < 0 || data.qualityScore > 100) {
    errors.push(`Invalid qualityScore: ${data.qualityScore}`);
    data.qualityScore = typeof data.qualityScore === "number"
      ? Math.max(0, Math.min(100, Math.round(data.qualityScore)))
      : 50;
  }

  if (!data.issues) {
    data.issues = [];
  } else if (!Array.isArray(data.issues)) {
    errors.push("'issues' must be an array");
    data.issues = [];
  } else {
    data.issues.forEach((issue, i) => {
      if (!issue.severity || !["critical", "warning", "info"].includes(issue.severity)) {
        errors.push(`issues[${i}].severity invalid: ${issue.severity}`);
        issue.severity = "warning";
      }
      if (!issue.field) {
        errors.push(`issues[${i}] missing field`);
        issue.field = "unknown";
      }
      if (!issue.description) {
        errors.push(`issues[${i}] missing description`);
        issue.description = "No description provided";
      }
    });
  }

  if (!data.missingItems) {
    data.missingItems = [];
  } else if (!Array.isArray(data.missingItems)) {
    data.missingItems = [];
  }

  return { valid: errors.length === 0, data, errors };
}

export function validateQuestions(data) {
  const errors = [];
  if (!data) return { valid: false, data: null, errors: ["No data to validate"] };

  if (!data.questions || !Array.isArray(data.questions)) {
    return { valid: false, data, errors: ["Missing or invalid 'questions' array"] };
  }

  data.questions.forEach((q, i) => {
    if (typeof q !== "object" || q === null) {
      errors.push(`questions[${i}] must be an object`);
      return;
    }
    if (!q.question || typeof q.question !== "string") {
      errors.push(`questions[${i}] missing 'question' string`);
    }
    if (q.id === undefined) {
      q.id = i + 1;
    }
  });

  data.questions = data.questions.filter(
    (q) => typeof q === "object" && q !== null && typeof q.question === "string"
  );
  data.totalQuestions = data.questions.length;

  return { valid: errors.length === 0, data, errors };
}
