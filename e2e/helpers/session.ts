/**
 * The test user's Cognito tokens, read from the login journey's storageState (where Amplify keeps
 * them in localStorage) and refreshed directly against Cognito. Refreshing doesn't run the
 * PreAuthentication trigger, so it needs neither Turnstile nor a TOTP code.
 */
import * as fs from "node:fs";
import { AUTH_FILE, REGION, TEST_EMAIL_DOMAIN, USER_EMAIL, appConfig } from "./config";

interface StorageState {
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
}

export interface Tokens {
  idToken: string;
  accessToken: string;
  sub: string;
  email: string;
}

let cached: Tokens | undefined;

function claims(jwt: string): Record<string, any> {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
}

function storedRefreshToken(): string {
  if (!fs.existsSync(AUTH_FILE)) throw new Error(`${AUTH_FILE} is missing; the login journey must run first.`);
  const state: StorageState = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  const prefix = `CognitoIdentityServiceProvider.${appConfig().clientId}.`;
  const items = state.origins.flatMap((o) => o.localStorage);
  const user = items.find((i) => i.name === `${prefix}LastAuthUser`)?.value;
  const refresh = user && items.find((i) => i.name === `${prefix}${user}.refreshToken`)?.value;
  if (!refresh) throw new Error(`No Cognito refresh token in ${AUTH_FILE}; did the login journey finish?`);
  return refresh;
}

async function cognito(target: string, body: object): Promise<any> {
  const response = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Cognito ${target} failed: ${response.status} ${json.__type ?? ""} ${json.message ?? ""}`);
  return json;
}

/**
 * Fresh tokens for the test user. Throws unless the ID token's email is the test address, which
 * is what keeps every cleanup call on the test account's own data.
 */
export async function tokens(): Promise<Tokens> {
  if (cached && claims(cached.idToken).exp * 1000 - Date.now() > 120_000) return cached;
  const result = await cognito("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: appConfig().clientId,
    AuthParameters: { REFRESH_TOKEN: storedRefreshToken() },
  });
  const idToken: string = result.AuthenticationResult.IdToken;
  const { sub, email } = claims(idToken);
  if (email !== USER_EMAIL || !String(email).endsWith(TEST_EMAIL_DOMAIN)) {
    throw new Error(`Signed in as ${email}, not the test account ${USER_EMAIL}; refusing to touch its data.`);
  }
  cached = { idToken, accessToken: result.AuthenticationResult.AccessToken, sub, email };
  return cached;
}

/** Revokes every refresh token the test user holds, including any captured in a trace. */
export async function globalSignOut(): Promise<void> {
  const { accessToken } = await tokens();
  await cognito("GlobalSignOut", { AccessToken: accessToken });
  cached = undefined;
}
