import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { auth, mfaEnrolled } from "../../test/amplify";
import { instance, withMfaDeadline } from "../../test/instance";
import MfaGate from "./MfaGate";

const PAST = "2026-11-02T00:00:00-05:00";

function renderGate() {
  render(
    <MfaGate>
      <p>App content</p>
    </MfaGate>
  );
}

const gate = () => screen.queryByRole("dialog", { name: "Set up two-step verification to continue" });

describe("MfaGate", () => {
  it("blocks an unenrolled user after the deadline, with no way to dismiss it", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-03T12:00:00Z") });
    withMfaDeadline(PAST);
    renderGate();

    expect(await screen.findByRole("dialog", { name: "Set up two-step verification to continue" })).toBeInTheDocument();
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
    expect(screen.getByText(/GrantWell asks for a code from an authenticator app/)).toBeInTheDocument();
    expect(screen.queryByText(/Since/)).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Set up two-step verification – GrantWell"));

    await userEvent.keyboard("{Escape}");
    expect(gate()).toBeInTheDocument();
  });

  it("lets the user through once enrolment finishes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-03T12:00:00Z") });
    withMfaDeadline(PAST);
    const user = userEvent.setup();
    renderGate();

    const setItUp = await screen.findByRole("button", { name: "Set it up" });
    // The focus trap focuses the first button 100 ms after opening; typing before then loses digits.
    await waitFor(() => expect(setItUp).toHaveFocus());
    await user.click(setItUp);
    await screen.findByText("SECRET123");
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));

    expect(await screen.findByText("App content")).toBeInTheDocument();
    expect(gate()).not.toBeInTheDocument();
  });

  it("puts focus back on Set it up after Back", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-03T12:00:00Z") });
    withMfaDeadline(PAST);
    const user = userEvent.setup();
    renderGate();

    const setItUp = await screen.findByRole("button", { name: "Set it up" });
    await waitFor(() => expect(setItUp).toHaveFocus());
    await user.click(setItUp);
    await screen.findByText("SECRET123");
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Set it up" })).toHaveFocus();
  });

  it("never blocks an enrolled user", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-03T12:00:00Z") });
    withMfaDeadline(PAST);
    mfaEnrolled(true);
    renderGate();
    await waitFor(() => expect(auth.fetchMFAPreference).toHaveBeenCalled());
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(gate()).not.toBeInTheDocument();
  });

  it("re-checks on a refreshed session before blocking", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-03T12:00:00Z") });
    withMfaDeadline(PAST);
    auth.fetchMFAPreference.mockResolvedValueOnce({}).mockResolvedValueOnce({ enabled: ["TOTP"], preferred: "TOTP" });
    renderGate();
    await waitFor(() => expect(auth.fetchMFAPreference).toHaveBeenCalledTimes(2));
    expect(auth.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(gate()).not.toBeInTheDocument();
  });

  it("blocks an unenrolled user on a pool that requires MFA without a deadline", async () => {
    instance.MFA_REQUIRED = true;
    renderGate();

    expect(await screen.findByRole("dialog", { name: "Set up two-step verification to continue" })).toBeInTheDocument();
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
    expect(screen.getByText(/GrantWell asks for a code from an authenticator app/)).toBeInTheDocument();
    expect(screen.queryByText(/Since|deadline/)).not.toBeInTheDocument();
  });

  it("does nothing before the deadline or without one", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-20T12:00:00Z") });
    withMfaDeadline(PAST);
    renderGate();
    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(auth.fetchMFAPreference).not.toHaveBeenCalled();
  });
});
