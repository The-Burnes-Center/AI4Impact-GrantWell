import { describe, expect, it } from "vitest";
import { readSignUpHandoff, signUpHandoffUrl } from "./state-sites";

const colorado = { state: "CO", url: "https://colorado.grantwell.us" };

describe("sign-up hand-off", () => {
  it("carries the email in the fragment, never the query string", () => {
    const url = new URL(signUpHandoffUrl(colorado, " pat+co@example.org "));
    expect(url.origin + url.pathname).toBe("https://colorado.grantwell.us/");
    expect(url.search).toBe("");
    expect(readSignUpHandoff(url.hash)).toEqual({ email: "pat+co@example.org" });
  });

  it("still opens sign-up when no email was typed", () => {
    expect(readSignUpHandoff(new URL(signUpHandoffUrl(colorado, "")).hash)).toEqual({ email: "" });
  });

  it("ignores any other fragment", () => {
    expect(readSignUpHandoff("")).toBeNull();
    expect(readSignUpHandoff("#main-content")).toBeNull();
  });
});
