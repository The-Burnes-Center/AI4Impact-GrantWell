import { mockClient } from "aws-sdk-client-mock";
import {
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_MARKERS } from "../../lib/monitoring/monitoring-stack";

const cognito = mockClient(CognitoIdentityProviderClient);
const REJECTED = "Bot verification failed. Reload the page and try again.";

let handler: (event: any) => Promise<any>;
beforeAll(async () => {
  vi.stubEnv("SUPPORTED_STATES", JSON.stringify([{ code: "MA", name: "Massachusetts" }]));
  ({ handler } = await import("../../lib/authorization/signup-triggers/index.mjs"));
});

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  cognito.reset();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const signUp = (token = "tok", state = "MA") => ({
  triggerSource: "PreSignUp_SignUp",
  userPoolId: "pool",
  userName: "sub-1",
  request: { clientMetadata: { turnstileToken: token, state }, userContextData: { ipAddress: "203.0.113.9" } },
});

/** The first argument of every console.error call, i.e. the line the alarm's metric filter sees. */
const loggedLines = () => errors.mock.calls.map(([line]) => String(line));

describe("Turnstile alarm markers", () => {
  it("logs turnstileUnavailable[0] and rejects when Cloudflare answers non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(handler(signUp())).rejects.toThrow(REJECTED);
    expect(loggedLines()).toContain(LOG_MARKERS.turnstileUnavailable[0]);
  });

  it("logs turnstileUnavailable[1] and rejects when the call itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(handler(signUp())).rejects.toThrow(REJECTED);
    expect(loggedLines()).toContain(LOG_MARKERS.turnstileUnavailable[1]);
  });

  it("logs turnstileNotConfigured and rejects without calling Cloudflare when the secret is missing", async () => {
    const siteverify = vi.fn();
    vi.stubGlobal("fetch", siteverify);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(handler(signUp())).rejects.toThrow(REJECTED);
    expect(siteverify).not.toHaveBeenCalled();
    expect(loggedLines().some((l) => l.startsWith(LOG_MARKERS.turnstileNotConfigured[0]))).toBe(true);
  });

  it("sends the secret, token and IP to siteverify and passes an accepted sign-up", async () => {
    const siteverify = vi.fn(async (_url: string, _init: any) => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal("fetch", siteverify);
    const event = signUp();
    await expect(handler(event)).resolves.toBe(event);
    const body = new URLSearchParams(String(siteverify.mock.calls[0][1].body));
    expect(Object.fromEntries(body)).toEqual({ secret: "secret", response: "tok", remoteip: "203.0.113.9" });
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("account setup alarm markers", () => {
  const confirm = (triggerSource: string) => ({
    triggerSource,
    userPoolId: "pool",
    userName: "sub-1",
    request: { clientMetadata: { state: "ma" }, userAttributes: {} },
  });

  it("saves the chosen state at confirmation", async () => {
    cognito.on(AdminUpdateUserAttributesCommand).resolves({});
    await handler(confirm("PostConfirmation_ConfirmSignUp"));
    expect(cognito.commandCalls(AdminUpdateUserAttributesCommand)[0].args[0].input).toEqual({
      UserPoolId: "pool",
      Username: "sub-1",
      UserAttributes: [{ Name: "custom:state", Value: "MA" }],
    });
  });

  it("logs accountSetupFailed[0] but still confirms the user when saving the state fails", async () => {
    cognito.on(AdminUpdateUserAttributesCommand).rejects(new Error("throttled"));
    const event = confirm("PostConfirmation_ConfirmSignUp");
    await expect(handler(event)).resolves.toBe(event);
    expect(loggedLines()).toContain(LOG_MARKERS.accountSetupFailed[0]);
  });

  it("signs out every session after a password reset", async () => {
    cognito.on(AdminUserGlobalSignOutCommand).resolves({});
    await handler(confirm("PostConfirmation_ConfirmForgotPassword"));
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)[0].args[0].input).toEqual({
      UserPoolId: "pool",
      Username: "sub-1",
    });
  });

  it("logs accountSetupFailed[1] when that sign-out fails", async () => {
    cognito.on(AdminUserGlobalSignOutCommand).rejects(new Error("throttled"));
    const event = confirm("PostConfirmation_ConfirmForgotPassword");
    await expect(handler(event)).resolves.toBe(event);
    expect(loggedLines()).toContain(LOG_MARKERS.accountSetupFailed[1]);
  });
});
