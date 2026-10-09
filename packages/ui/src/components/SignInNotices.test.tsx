import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LATEST_RELEASE } from "../common/release-notes";
import { auth, mfaEnrolled, signedInAs } from "../test/amplify";
import { instance, withMfaDeadline } from "../test/instance";
import { renderApp } from "../test/render";
import SignInNotices from "./SignInNotices";

const MFA_PROMPT = "Add two-step verification";
const WHATS_NEW = "What's new in GrantWell";

const dialog = (name: string | RegExp) => screen.queryByRole("dialog", { name });

describe("SignInNotices", () => {
  it("shows the MFA prompt first and What's new only after it closes", async () => {
    const { user } = renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: MFA_PROMPT })).toBeInTheDocument();
    expect(dialog(WHATS_NEW)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
    expect(dialog(MFA_PROMPT)).not.toBeInTheDocument();
  });

  it("goes straight to What's new for an enrolled user", async () => {
    mfaEnrolled(true);
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
    expect(dialog(MFA_PROMPT)).not.toBeInTheDocument();
  });

  it("goes straight to What's new when the deployment turns MFA off", async () => {
    instance.MFA_ENABLED = false;
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
    expect(auth.fetchMFAPreference).not.toHaveBeenCalled();
  });

  it("still shows What's new when the MFA check fails", async () => {
    auth.fetchMFAPreference.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
  });

  it("snoozes the prompt for 30 days after Not now", async () => {
    const first = renderApp(<SignInNotices />);
    await first.user.click(await screen.findByRole("button", { name: "Not now" }));
    await first.user.click(await screen.findByRole("button", { name: "Got it" }));
    first.unmount();

    renderApp(<SignInNotices />);
    await waitFor(() => expect(auth.fetchAuthSession).toHaveBeenCalledTimes(4));
    expect(dialog(MFA_PROMPT)).not.toBeInTheDocument();
  });
});

describe("MfaPrompt before an MFA deadline", () => {
  const signIn = (authTime: number) => signedInAs({ auth_time: authTime });

  it("names the date and the days left, and returns at the next sign-in, not the next page load", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-27T12:00:00Z") });
    withMfaDeadline("2026-11-02T00:00:00-05:00");
    signIn(100);

    const first = renderApp(<SignInNotices />);
    expect(
      await screen.findByRole("dialog", { name: "Two-step verification is required from November 2" })
    ).toBeInTheDocument();
    expect(screen.getByText("6 days left.")).toBeInTheDocument();
    await first.user.click(screen.getByRole("button", { name: "Not now" }));
    first.unmount();

    const reload = renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
    expect(dialog(/Two-step verification is required/)).not.toBeInTheDocument();
    reload.unmount();

    signIn(200);
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: /Two-step verification is required/ })).toBeInTheDocument();
  });
});

describe("WhatsNewDialog", () => {
  it("shows the latest highlights once per version per user", async () => {
    mfaEnrolled(true);
    const first = renderApp(<SignInNotices />);
    await first.user.click(await screen.findByRole("button", { name: "Got it" }));
    expect(localStorage.getItem("gw.whatsNewSeen.user-1")).toBe(LATEST_RELEASE?.version);
    first.unmount();

    const again = renderApp(<SignInNotices />);
    await waitFor(() => expect(auth.fetchAuthSession).toHaveBeenCalledTimes(4));
    expect(dialog(WHATS_NEW)).not.toBeInTheDocument();
    again.unmount();

    signedInAs({ sub: "user-2" });
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
  });

  it("still shows when storage is unavailable", async () => {
    mfaEnrolled(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderApp(<SignInNotices />);
    expect(await screen.findByRole("dialog", { name: WHATS_NEW })).toBeInTheDocument();
  });
});
