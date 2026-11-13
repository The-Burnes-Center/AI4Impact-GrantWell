import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { input: any }[]);
vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const command = (name: string) => ({ [name]: class { constructor(public input: any) {} } })[name];
  return {
    CognitoIdentityProviderClient: class {
      async send(cmd: { input: any }) {
        sent.push(cmd);
        return {};
      }
    },
    AdminUpdateUserAttributesCommand: command("AdminUpdateUserAttributesCommand"),
    AdminUserGlobalSignOutCommand: command("AdminUserGlobalSignOutCommand"),
  };
});

// grantwell.us once Colorado has its own site: read at load.
process.env.TURNSTILE_DISABLED = "true";
delete process.env.SINGLE_STATE;
process.env.SUPPORTED_STATES = JSON.stringify([
  { code: "CO", name: "Colorado" },
  { code: "MA", name: "Massachusetts" },
]);
process.env.STATE_SITES = JSON.stringify([{ state: "CO", url: "https://colorado.grantwell.us" }]);
const { handler } = await import("../lib/authorization/signup-triggers/index.mjs");

const signUp = (state: string) => ({ triggerSource: "PreSignUp_SignUp", request: { clientMetadata: { state } } });
const confirm = (state: string) => ({
  triggerSource: "PostConfirmation_ConfirmSignUp",
  userPoolId: "pool",
  userName: "u1",
  request: { clientMetadata: { state } },
});

beforeEach(() => {
  sent.length = 0;
});

describe("a state with its own site", () => {
  it("can't sign up here, whatever the client sends", async () => {
    for (const state of ["CO", "co", " CO "]) {
      await expect(handler(signUp(state))).rejects.toThrow("Colorado has its own GrantWell site. Create your account at https://colorado.grantwell.us.");
    }
  });

  it("leaves the other states' sign-up alone", async () => {
    const event = signUp("MA");
    await expect(handler(event)).resolves.toBe(event);
  });

  it("isn't set on an account when the confirmation asks for it", async () => {
    for (const state of ["CO", " co "]) {
      const event = confirm(state);
      await expect(handler(event)).resolves.toBe(event);
    }
    expect(sent).toEqual([]);
  });

  it("leaves the other states' confirmation alone", async () => {
    await handler(confirm("MA"));
    expect(sent.map((c) => c.input.UserAttributes)).toEqual([[{ Name: "custom:state", Value: "MA" }]]);
  });
});
