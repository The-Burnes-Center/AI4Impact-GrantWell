import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({ getParameter: vi.fn() }));

vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send = (cmd: any) => aws.getParameter(cmd.input);
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    send = vi.fn();
  },
  AdminUpdateUserAttributesCommand: class {},
  AdminUserGlobalSignOutCommand: class {},
}));

const { handler } = await import("../lib/authorization/signup-triggers/index.mjs");
const { resetE2EBypassCache } = await import("../lib/authorization/signup-triggers/e2e-bypass.mjs");

const PARAM = "/grantwell-generic-dev/e2e/turnstile-bypass";
const TOKEN = "a".repeat(64);
const TEST_EMAIL = "e2e-dev@grantwell.invalid";
const REJECTED = "Bot verification failed. Reload the page and try again.";

const siteverify = vi.fn();

const signIn = (email: string, token: string) => ({
  triggerSource: "PreAuthentication_Authentication",
  userPoolId: "pool",
  userName: "sub",
  request: { userAttributes: { email }, validationData: { turnstileToken: token } },
});

beforeEach(() => {
  resetE2EBypassCache();
  process.env.TURNSTILE_SECRET_KEY = "secret";
  process.env.E2E_BYPASS_PARAM = PARAM;
  process.env.E2E_TEST_EMAILS = TEST_EMAIL;
  aws.getParameter.mockReset().mockResolvedValue({ Parameter: { Value: TOKEN } });
  // Cloudflare refuses every token here, so passing means the bypass was taken.
  siteverify.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
  vi.stubGlobal("fetch", siteverify);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the dev-only Turnstile bypass on sign-in", () => {
  it("lets an allowlisted test account in with the SSM token, without calling Cloudflare", async () => {
    const event = signIn(TEST_EMAIL, TOKEN);
    await expect(handler(event)).resolves.toBe(event);
    expect(siteverify).not.toHaveBeenCalled();
    expect(aws.getParameter).toHaveBeenCalledWith({ Name: PARAM, WithDecryption: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("turnstile-e2e-bypass"));
  });

  it("matches the address case-insensitively and reads SSM once per container", async () => {
    await handler(signIn(TEST_EMAIL.toUpperCase(), TOKEN));
    await handler(signIn(TEST_EMAIL, TOKEN));
    expect(aws.getParameter).toHaveBeenCalledTimes(1);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("does nothing for a real address, and never reads SSM for it", async () => {
    await expect(handler(signIn("someone@grantwell.us", TOKEN))).rejects.toThrow(REJECTED);
    expect(siteverify).toHaveBeenCalledTimes(1);
    expect(aws.getParameter).not.toHaveBeenCalled();
  });

  it("does nothing for an allowlisted address outside @grantwell.invalid", async () => {
    process.env.E2E_TEST_EMAILS = `${TEST_EMAIL},someone@grantwell.us`;
    await expect(handler(signIn("someone@grantwell.us", TOKEN))).rejects.toThrow(REJECTED);
    expect(aws.getParameter).not.toHaveBeenCalled();
  });

  it("does nothing for a .invalid address that isn't allowlisted", async () => {
    await expect(handler(signIn("other@grantwell.invalid", TOKEN))).rejects.toThrow(REJECTED);
    expect(aws.getParameter).not.toHaveBeenCalled();
  });

  it("rejects a wrong token for the test account", async () => {
    await expect(handler(signIn(TEST_EMAIL, "b".repeat(64)))).rejects.toThrow(REJECTED);
    await expect(handler(signIn(TEST_EMAIL, "short"))).rejects.toThrow(REJECTED);
    expect(siteverify).toHaveBeenCalledTimes(2);
  });

  it("is unreachable without E2E_BYPASS_PARAM, as on prod", async () => {
    delete process.env.E2E_BYPASS_PARAM;
    await expect(handler(signIn(TEST_EMAIL, TOKEN))).rejects.toThrow(REJECTED);
    expect(aws.getParameter).not.toHaveBeenCalled();
    expect(siteverify).toHaveBeenCalledTimes(1);
  });

  it("falls back to the real check when the parameter can't be read, and retries next time", async () => {
    aws.getParameter.mockRejectedValueOnce(Object.assign(new Error("gone"), { name: "ParameterNotFound" }));
    await expect(handler(signIn(TEST_EMAIL, TOKEN))).rejects.toThrow(REJECTED);
    await expect(handler(signIn(TEST_EMAIL, TOKEN))).resolves.toBeDefined();
    expect(aws.getParameter).toHaveBeenCalledTimes(2);
  });

  it("does not apply to sign-up", async () => {
    const event = {
      triggerSource: "PreSignUp_SignUp",
      userPoolId: "pool",
      userName: "sub",
      request: { userAttributes: { email: TEST_EMAIL }, clientMetadata: { turnstileToken: TOKEN } },
    };
    await expect(handler(event)).rejects.toThrow(REJECTED);
    expect(aws.getParameter).not.toHaveBeenCalled();
  });
});
