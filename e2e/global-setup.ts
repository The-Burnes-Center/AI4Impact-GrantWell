/**
 * Resolves the deployed dev site and the bypass token, then hands them to the workers through env
 * (workers are forked after global setup; nothing secret is written to disk).
 */
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { BYPASS_PARAMETER, REGION, SITE_URL, removeAuthDir, requireEnv } from "./helpers/config";

async function readAwsExports() {
  const response = await fetch(`${SITE_URL}/aws-exports.json`);
  if (!response.ok) throw new Error(`${SITE_URL}/aws-exports.json → ${response.status}; is the site deployed?`);
  const exports = await response.json();
  const userPoolId = exports?.Auth?.userPoolId;
  const clientId = exports?.Auth?.userPoolWebClientId;
  const httpEndpoint = exports?.httpEndpoint;
  if (!userPoolId || !clientId || !httpEndpoint) {
    throw new Error(`${SITE_URL}/aws-exports.json lacks Auth.userPoolId, Auth.userPoolWebClientId or httpEndpoint`);
  }
  return { userPoolId, clientId, httpEndpoint };
}

async function readBypassToken(): Promise<string> {
  try {
    const result = await new SSMClient({ region: REGION }).send(
      new GetParameterCommand({ Name: BYPASS_PARAMETER, WithDecryption: true })
    );
    if (result.Parameter?.Value) return result.Parameter.Value;
  } catch (error) {
    throw new Error(
      `Could not read the Turnstile bypass ${BYPASS_PARAMETER} (${(error as Error).name}). In CI the e2e role ` +
        "provides it; locally, export AWS credentials for the dev account."
    );
  }
  throw new Error(`${BYPASS_PARAMETER} is empty.`);
}

export default async function globalSetup(): Promise<void> {
  requireEnv("E2E_USER_PASSWORD", "The test account's password");
  requireEnv("E2E_TOTP_SECRET", "The test account's TOTP setup key");
  removeAuthDir();

  const config = await readAwsExports();
  process.env.E2E_RESOLVED_USER_POOL_ID = config.userPoolId;
  process.env.E2E_RESOLVED_CLIENT_ID = config.clientId;
  process.env.E2E_RESOLVED_HTTP_ENDPOINT = config.httpEndpoint;
  process.env.E2E_RESOLVED_BYPASS_TOKEN = await readBypassToken();

  console.log(`[e2e setup] site: ${SITE_URL}`);
  console.log(`[e2e setup] user pool: ${config.userPoolId}`);
}
