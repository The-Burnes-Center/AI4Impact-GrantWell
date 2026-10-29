import { describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const command = (name: string) => ({ [name]: class { constructor(public input: any) {} } })[name];
  return {
    CognitoIdentityProviderClient: class {
      async send() {
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
});
