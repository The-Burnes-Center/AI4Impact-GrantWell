/**
 * Schema validators and shared helpers for the NOFO pipeline.
 *
 * Each validator normalises the parsed data, filling in defaults for
 * missing fields so downstream code can rely on a consistent shape.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SUMMARY_ARRAY_FIELDS = [
  "EligibilityCriteria",
  "RequiredDocuments",
  "ProjectNarrativeSections",
  "KeyDeadlines",
];

export { SUMMARY_ARRAY_FIELDS };

export function countItems(summary) {
  return SUMMARY_ARRAY_FIELDS.reduce(
    (total, field) => total + (summary[field]?.length || 0),
    0
  );
}

// ---------------------------------------------------------------------------
// Content-presence check helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /^n\/?a$/i,
  /^not available/i,
  /^not specified/i,
  /^information not (found|available)/i,
  /^none$/i,
  /^no information/i,
  /^not provided/i,
  /^not applicable/i,
  /^to be determined/i,
  /^tbd$/i,
  /^unknown$/i,
];

export function isPlaceholderText(text) {
  if (!text || typeof text !== "string") return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

export function hasMeaningfulContent(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(
    (item) =>
      item &&
      !isPlaceholderText(item.item) &&
      !isPlaceholderText(item.description)
  );
}

export function safeJsonParse(str) {
  if (!str) return null;
  if (typeof str === "object") return str;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function httpResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
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

  for (const field of SUMMARY_ARRAY_FIELDS) {
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
