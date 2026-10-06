import * as fs from "node:fs";
import * as path from "node:path";

export const REGION = process.env.AWS_REGION ?? "us-east-1";

/** The only address the suite may act as. The trigger Lambda and InstanceConfig validation hard-code the domain too. */
export const TEST_EMAIL_DOMAIN = "@grantwell.invalid";
export const USER_EMAIL = process.env.E2E_USER_EMAIL ?? `e2e-dev${TEST_EMAIL_DOMAIN}`;

export const BYPASS_PARAMETER = process.env.E2E_BYPASS_PARAM ?? "/grantwell-generic-dev/e2e/turnstile-bypass";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
/** Playwright storageState from the login journey. Gitignored, deleted by global teardown. */
export const AUTH_FILE = path.join(AUTH_DIR, "user.json");
/** What the login journey resolved for the other specs (no secrets). */
export const RUN_FILE = path.join(AUTH_DIR, "run.json");

/** Generic's dev siteUrl, read from its config so the two can't drift. E2E_SITE_URL overrides it. */
function genericDevSiteUrl(): string {
  const file = path.join(__dirname, "..", "..", "instances", "generic", "config", "instances.ts");
  const text = fs.readFileSync(file, "utf8");
  const match = text.slice(text.indexOf('id: "generic-dev"')).match(/siteUrl:\s*"([^"]+)"/);
  if (!match) throw new Error(`No generic-dev siteUrl found in ${file}; set E2E_SITE_URL`);
  return match[1];
}

export const SITE_URL = (process.env.E2E_SITE_URL ?? genericDevSiteUrl()).replace(/\/$/, "");

export function appUrl(p: string): string {
  return new URL(p, SITE_URL).toString();
}

export function requireEnv(name: string, what: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${what} is missing: set ${name}.`);
  return value;
}

/** The site's own runtime config, resolved once by global setup and passed to workers through env. */
export interface AppConfig {
  userPoolId: string;
  clientId: string;
  httpEndpoint: string;
}

export function appConfig(): AppConfig {
  return {
    userPoolId: requireEnv("E2E_RESOLVED_USER_POOL_ID", "The user pool id (resolved by global setup)"),
    clientId: requireEnv("E2E_RESOLVED_CLIENT_ID", "The app client id (resolved by global setup)"),
    httpEndpoint: requireEnv("E2E_RESOLVED_HTTP_ENDPOINT", "The HTTP API endpoint (resolved by global setup)"),
  };
}

export interface RunInfo {
  nofoName: string;
  narrativeSections: string[];
}

export function runInfo(): RunInfo {
  if (!fs.existsSync(RUN_FILE)) throw new Error(`${RUN_FILE} is missing; the login journey (auth.setup.ts) must run first.`);
  return JSON.parse(fs.readFileSync(RUN_FILE, "utf8"));
}

export function writeRunInfo(info: RunInfo): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(RUN_FILE, JSON.stringify(info, null, 2));
}

export function removeAuthDir(): void {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}
