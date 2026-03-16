const MASS_GOV_FORM_URL = "https://forms.mass.gov/eoanf/form/62/";
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

async function fetchFormTokens() {
  const res = await fetch(MASS_GOV_FORM_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GrantWell/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch form page: ${res.status}`);
  }

  const html = await res.text();

  const stateMatch =
    html.match(/name=['"]state_62['"][^>]*value=['"]([^'"]*)['"]/);
  const currencyMatch =
    html.match(/name=['"]gform_currency['"][^>]*value=['"]([^'"]*)['"]/);

  if (!stateMatch) {
    throw new Error("Could not extract state_62 token from form page");
  }

  return {
    state: stateMatch[1],
    currency: currencyMatch ? currencyMatch[1] : "",
  };
}

async function submitToGravityForms(tokens, foundAnswer, feedbackText) {
  const formData = new URLSearchParams();
  formData.append("input_1", foundAnswer);
  formData.append("input_3", feedbackText || "");
  formData.append("is_submit_62", "1");
  formData.append("gform_submit", "62");
  formData.append("gform_unique_id", "");
  formData.append("gform_target_page_number_62", "0");
  formData.append("gform_source_page_number_62", "1");
  formData.append("gform_field_values", "");
  formData.append("state_62", tokens.state);
  formData.append("gform_currency", tokens.currency);

  const res = await fetch(MASS_GOV_FORM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
    redirect: "follow",
  });

  return {
    status: res.status,
    ok: res.ok,
  };
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return respond(200, { message: "OK" });
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return respond(400, { message: "Invalid JSON body" });
    }

    const { found_what_looking_for, feedback_text } = body;

    if (!found_what_looking_for || !["Yes", "No"].includes(found_what_looking_for)) {
      return respond(400, {
        message: "found_what_looking_for is required and must be 'Yes' or 'No'",
      });
    }

    if (found_what_looking_for === "No" && (!feedback_text || !feedback_text.trim())) {
      return respond(400, {
        message: "feedback_text is required when answer is 'No'",
      });
    }

    const tokens = await fetchFormTokens();
    const result = await submitToGravityForms(
      tokens,
      found_what_looking_for,
      feedback_text
    );

    if (result.ok || result.status === 200 || result.status === 302) {
      return respond(200, { message: "Feedback submitted successfully" });
    }

    console.error("Gravity Forms returned non-OK status:", result.status);
    return respond(502, {
      message: "Feedback submission failed. Please try again.",
    });
  } catch (err) {
    console.error("Error in feedback proxy:", err.message);
    return respond(500, {
      message: "Internal server error. Please try again later.",
    });
  }
};
