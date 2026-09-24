import { timingSafeEqual } from "node:crypto";

// A second lock that doesn't depend on config: .invalid is reserved (RFC 2606), so a leaked token
// can't sign in an account a real person holds.
const TEST_EMAIL_DOMAIN = "@grantwell.invalid";

let ssmClient;
let bypassToken;

function isTestEmail(email) {
  if (typeof email !== "string") return false;
  const address = email.trim().toLowerCase();
  if (!address.endsWith(TEST_EMAIL_DOMAIN)) return false;
  const allowed = (process.env.E2E_TEST_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());
  return allowed.includes(address);
}

async function readBypassToken(parameterName) {
  if (bypassToken) return bypassToken;
  // Loaded here so deployments without the bypass never pay for the SSM client at cold start.
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  ssmClient ??= new SSMClient({
    region: process.env.AWS_REGION || "us-east-1",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 1500 },
  });
  const result = await ssmClient.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true })
  );
  bypassToken = result.Parameter?.Value || undefined;
  return bypassToken;
}

/**
 * True when a dev e2e account presents the bypass token, so the Turnstile check can be skipped.
 * CDK sets E2E_BYPASS_PARAM only on deployments whose config has `e2e`, which validation refuses on
 * prod. Real users fail the email check before any SSM call.
 */
export async function isE2EBypass(metadataSource, email) {
  const parameterName = process.env.E2E_BYPASS_PARAM;
  const token = metadataSource?.turnstileToken;
  if (!parameterName || typeof token !== "string" || token === "" || !isTestEmail(email)) {
    return false;
  }

  let expected;
  try {
    expected = await readBypassToken(parameterName);
  } catch (error) {
    console.error("E2E bypass parameter could not be read", { error: error?.name });
    return false;
  }
  if (!expected) return false;

  const given = Buffer.from(token);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return false;

  console.log("turnstile-e2e-bypass: bot check skipped for a test account");
  return true;
}

export function resetE2EBypassCache() {
  bypassToken = undefined;
  ssmClient = undefined;
}
