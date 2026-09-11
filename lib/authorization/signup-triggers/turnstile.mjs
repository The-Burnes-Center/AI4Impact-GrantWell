const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cognito kills a trigger at 5s and the limit is not configurable, so the siteverify call gets a
// hard budget well inside it. A timeout is treated as a verification failure, not a pass.
const SITEVERIFY_TIMEOUT_MS = 2000;

const USER_FACING_ERROR = "Bot verification failed. Reload the page and try again.";

function readToken(source) {
  const raw = source?.turnstileToken;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Verifies a Turnstile token, throwing on any outcome that is not an explicit success.
 *
 * `metadataSource` differs per trigger: pre sign-up receives ClientMetadata as
 * `request.clientMetadata`, while pre authentication receives it as `request.validationData`.
 */
export async function assertTurnstileToken(metadataSource, ipAddress) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set; rejecting request");
    throw new Error(USER_FACING_ERROR);
  }

  const token = readToken(metadataSource);
  if (!token) {
    console.error("No Turnstile token present on request");
    throw new Error(USER_FACING_ERROR);
  }

  const body = new URLSearchParams({ secret, response: token });
  // Cognito only populates userContextData when threat protection is on. Sending an empty remoteip
  // would fail verification outright, so it is omitted when unavailable.
  if (ipAddress) {
    body.set("remoteip", ipAddress);
  }

  let outcome;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("Turnstile siteverify returned a non-OK status", {
        status: response.status,
      });
      throw new Error(USER_FACING_ERROR);
    }

    outcome = await response.json();
  } catch (error) {
    if (error?.message === USER_FACING_ERROR) throw error;
    console.error("Turnstile siteverify call failed", { error: error?.message });
    throw new Error(USER_FACING_ERROR);
  }

  if (outcome?.success !== true) {
    console.error("Turnstile rejected the token", {
      errorCodes: outcome?.["error-codes"],
    });
    throw new Error(USER_FACING_ERROR);
  }
}
