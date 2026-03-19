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

export function countItems(summary) {
  return SUMMARY_ARRAY_FIELDS.reduce(
    (total, field) => total + (summary[field]?.length || 0),
    0
  );
}

export function computeQualityScore(summary) {
  let score = 0;
  const weights = {
    EligibilityCriteria: 30,
    RequiredDocuments: 20,
    ProjectNarrativeSections: 30,
    KeyDeadlines: 20,
  };

  for (const [field, weight] of Object.entries(weights)) {
    const items = summary[field];
    if (Array.isArray(items) && items.length > 0) {
      const baseScore = Math.min(items.length / 2, 1) * weight * 0.6;
      const confidenceBonus =
        items.filter((i) => i.confidence === "high").length / items.length *
        weight * 0.4;
      score += baseScore + confidenceBonus;
    }
  }

  return Math.round(Math.min(score, 100));
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
