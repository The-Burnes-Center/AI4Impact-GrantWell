import { describe, expect, it } from "vitest";
import {
  getPasswordValidationError,
  getSignUpValidationError,
  getVerificationCodeValidationError,
  isValidEmail,
  mapAuthError,
} from "./auth-utils";
import { parseRoleClaim, roleLabel } from "../../common/helpers/auth-roles";

describe("mapAuthError", () => {
  it("never tells a signing-in visitor whether the account exists", () => {
    expect(mapAuthError({ name: "UserNotFoundException" }, "sign-in")).toBe("Email or password is incorrect.");
    expect(mapAuthError({ name: "NotAuthorizedException" }, "sign-in")).toBe("Email or password is incorrect.");
  });

  it("surfaces the message of a Cognito trigger that rejected the request", () => {
    const error = { name: "UserLambdaValidationException", message: "PreSignUp failed with error Sign-ups are closed." };
    expect(mapAuthError(error, "sign-up")).toBe("Sign-ups are closed.");
  });

  it("names the authentication code in MFA contexts and the verification code elsewhere", () => {
    expect(mapAuthError({ code: "CodeMismatchException" }, "mfa")).toBe("The authentication code is incorrect.");
    expect(mapAuthError({ code: "CodeMismatchException" }, "verify-sign-up")).toBe("The verification code is incorrect.");
  });

  it("falls back to a message for the context on an unknown error", () => {
    expect(mapAuthError(new Error("boom"), "mfa-setup")).toBe(
      "We could not finish setting up two-step verification. Try again."
    );
  });
});

describe("form validation", () => {
  it("checks email shape after trimming and lower-casing", () => {
    expect(isValidEmail("  Person@Example.org ")).toBe(true);
    expect(isValidEmail("person@example")).toBe(false);
  });

  it("reports the first unmet password rule", () => {
    expect(getPasswordValidationError("Short1!")).toBe("Password must be at least 8 characters long.");
    expect(getPasswordValidationError("longenough1!")).toBe("Password must include at least one uppercase letter.");
    expect(getPasswordValidationError("Longenough1")).toBe("Password must include at least one symbol.");
    expect(getPasswordValidationError("Longenough1!")).toBeNull();
  });

  it("requires matching passwords on sign-up", () => {
    expect(getSignUpValidationError("a@b.co", "Longenough1!", "Longenough1?")).toBe("Passwords do not match.");
  });

  it("requires a 6-digit code", () => {
    expect(getVerificationCodeValidationError(" 12345 ")).toBe("Enter the 6-digit verification code.");
    expect(getVerificationCodeValidationError("123456")).toBeNull();
  });
});

describe("parseRoleClaim", () => {
  it("reads the JSON-array string Cognito stores, a real array, or a bare role", () => {
    expect(parseRoleClaim('["Admin","Developer"]')).toEqual(["Admin", "Developer"]);
    expect(parseRoleClaim(["Admin", 3])).toEqual(["Admin"]);
    expect(parseRoleClaim("Admin")).toEqual(["Admin"]);
  });

  it("treats a missing or empty claim as no roles", () => {
    expect(parseRoleClaim(undefined)).toEqual([]);
    expect(parseRoleClaim("  ")).toEqual([]);
    expect(parseRoleClaim("{}")).toEqual([]);
  });

  it("labels PlatformAdmin for people and passes unknown roles through", () => {
    expect(roleLabel("PlatformAdmin")).toBe("Platform Admin");
    expect(roleLabel("Auditor")).toBe("Auditor");
  });
});
