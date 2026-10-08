import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({ sent: [] as { name: string; input: any }[], fail: false }));

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const command = (name: string) =>
    ({ [name]: class { constructor(public input: any) {} } })[name];
  return {
    CognitoIdentityProviderClient: class {
      async send(cmd: any) {
        aws.sent.push({ name: cmd.constructor.name, input: cmd.input });
        if (aws.fail) throw new Error("throttled");
        return {};
      }
    },
    AdminUpdateUserAttributesCommand: command("AdminUpdateUserAttributesCommand"),
    AdminUserGlobalSignOutCommand: command("AdminUserGlobalSignOutCommand"),
  };
});

// A single-state deployment with the bot check off, as MA runs: both flags are read at load.
process.env.TURNSTILE_DISABLED = "true";
process.env.SINGLE_STATE = "MA";
process.env.SUPPORTED_STATES = JSON.stringify([{ code: "MA", name: "Massachusetts" }]);
delete process.env.TURNSTILE_SECRET_KEY;
const { handler } = await import("../lib/authorization/signup-triggers/index.mjs");

const siteverify = vi.fn();
beforeEach(() => {
  aws.sent.length = 0;
  aws.fail = false;
  siteverify.mockReset();
  vi.stubGlobal("fetch", siteverify);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signIn = (state?: string, role?: string) => ({
  triggerSource: "PreAuthentication_Authentication",
  userPoolId: "pool",
  userName: "sub-1",
  request: {
    userAttributes: { email: "a@mass.gov", ...(state !== undefined && { "custom:state": state }), ...(role && { "custom:role": role }) },
    validationData: {},
  },
});
const writes = () => aws.sent.filter((c) => c.name === "AdminUpdateUserAttributesCommand").map((c) => c.input.UserAttributes);

describe("Turnstile off", () => {
  it("lets sign-up and sign-in through without a token and never calls Cloudflare", async () => {
    const signUp = { triggerSource: "PreSignUp_SignUp", request: { clientMetadata: {} } };
    await expect(handler(signUp)).resolves.toBe(signUp);
    await expect(handler(signIn("MA"))).resolves.toBeTruthy();
    expect(siteverify).not.toHaveBeenCalled();
  });
});

describe("single state", () => {
  it("gives a new user the state whatever the client sent", async () => {
    await handler({ triggerSource: "PostConfirmation_ConfirmSignUp", userPoolId: "pool", userName: "sub-1", request: { clientMetadata: {} } });
    expect(writes()).toEqual([[{ Name: "custom:state", Value: "MA" }]]);
  });

  it("fills in a missing or other state at sign-in, for every role", async () => {
    for (const [state, role] of [[undefined, undefined], ["", '["Admin"]'], ["Massachusetts", '["Developer"]']] as const) {
      aws.sent.length = 0;
      await handler(signIn(state, role));
      expect(writes()).toEqual([[{ Name: "custom:state", Value: "MA" }]]);
    }
  });

  it("makes no Cognito call when the state is already set", async () => {
    await handler(signIn("MA", '["Admin"]'));
    expect(aws.sent).toEqual([]);
  });

  it("still signs the user in when filling in the state fails", async () => {
    aws.fail = true;
    const event = signIn("");
    await expect(handler(event)).resolves.toBe(event);
    expect(console.error).toHaveBeenCalledWith("Could not fill in custom:state at sign-in", expect.anything());
  });

  it("rejects sign-up with another state", async () => {
    await expect(handler({ triggerSource: "PreSignUp_SignUp", request: { clientMetadata: { state: "RI" } } })).rejects.toThrow(/supported state/);
  });
});
