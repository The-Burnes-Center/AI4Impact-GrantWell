import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../../test/amplify";
import AuthPanel from "./AuthPanel";

afterEach(() => vi.useRealTimers());

const CHALLENGE = { nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_TOTP_CODE" } };
const NEW_PASSWORD = { nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" } };
const setupStep = (secret: string) => ({
  nextStep: {
    signInStep: "CONTINUE_SIGN_IN_WITH_TOTP_SETUP",
    totpSetupDetails: {
      sharedSecret: secret,
      getSetupUri: (issuer: string, account: string) =>
        new URL(`otpauth://totp/${issuer}:${account}?secret=${secret}`),
    },
  },
});

async function signInTo(step: object, password = "Password1!") {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  auth.signIn.mockResolvedValue(step);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(<AuthPanel onAuthenticated={() => {}} />);
  const form = screen.getByRole("form", { name: "Sign in form" });
  await user.type(within(form).getByLabelText(/Email/), "user@example.com");
  await user.type(within(form).getByLabelText(/^Password/), password);
  await user.click(within(form).getByRole("button", { name: "Sign in" }));
  return { user, container: view.container };
}

const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const timeAlert = (container: HTMLElement) => container.querySelector<HTMLElement>('.visually-hidden[role="alert"]')!;
const politeRegion = (container: HTMLElement) => container.querySelector<HTMLElement>('.visually-hidden[aria-live="polite"]')!;
const digit = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);

describe("AuthPanel sign-in time limit (WCAG 2.2.1)", () => {
  it("warns 2 minutes before the 15-minute limit and keeps the sign-in going", async () => {
    const { user } = await signInTo(CHALLENGE);
    expect(await screen.findByRole("form", { name: "Two-step verification form" })).toBeInTheDocument();

    await advance(12 * 60_000);
    expect(screen.queryByText(/times out in/)).toBeNull();
    await advance(60_000 + 1);
    expect(screen.getByText(/this sign-in times out in 2:00/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(auth.signIn).toHaveBeenCalledTimes(2);
    expect(auth.signIn.mock.calls[1][0]).toMatchObject({ username: "user@example.com", password: "Password1!" });
    expect(screen.queryByText(/times out in/)).toBeNull();
    expect(screen.getByRole("form", { name: "Two-step verification form" })).toBeInTheDocument();
  });

  it("counts down visibly but announces only at 2:00 and 0:30", async () => {
    const { container } = await signInTo(CHALLENGE);
    await screen.findByRole("form", { name: "Two-step verification form" });
    const spoken: string[] = [];
    const observer = new MutationObserver(() => {
      const text = timeAlert(container).textContent ?? "";
      if (text && text !== spoken[spoken.length - 1]) spoken.push(text);
    });
    observer.observe(timeAlert(container), { childList: true, characterData: true, subtree: true });

    await advance(13 * 60_000 + 1);
    const warning = screen.getByText(/this sign-in times out in 2:00/);
    expect(warning.closest("[aria-live], [role=alert], [role=status]")).toBeNull();
    await advance(13_000);
    expect(warning).toHaveTextContent("times out in 1:47.");
    await advance(76_000);
    expect(warning).toHaveTextContent("times out in 0:31.");
    await advance(1_000);
    expect(warning).toHaveTextContent("times out in 0:30.");
    await advance(25_000);
    expect(warning).toHaveTextContent("times out in 0:05.");
    observer.disconnect();

    expect(spoken).toEqual([
      "For your security, this sign-in times out in 2 minutes. Select Keep signing in to continue.",
      "This sign-in times out in 30 seconds. Select Keep signing in to continue.",
    ]);
  });

  it("still says to select Keep signing in when a throttled tab skips the 2:00 warning", async () => {
    const { container } = await signInTo(CHALLENGE);
    await screen.findByRole("form", { name: "Two-step verification form" });
    await advance(13 * 60_000 - 1_000);
    vi.setSystemTime(Date.now() + 95_000);
    await advance(1_000);

    expect(timeAlert(container)).toHaveTextContent(
      /^This sign-in times out in 2\d seconds\. Select Keep signing in to continue\.$/,
    );
  });

  it("says Please wait while the signed-out notice is still showing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    auth.signIn.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <AuthPanel onAuthenticated={() => {}} notice="You've been signed out. Please sign in again." />,
    );
    expect(screen.getByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
    expect(politeRegion(container)).toBeEmptyDOMElement();

    const form = screen.getByRole("form", { name: "Sign in form" });
    await user.type(within(form).getByLabelText(/Email/), "user@example.com");
    await user.type(within(form).getByLabelText(/^Password/), "Password1!");
    await user.click(within(form).getByRole("button", { name: "Sign in" }));

    expect(politeRegion(container)).toHaveTextContent("Please wait…");
    expect(screen.getByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
  });

  it("returns to Sign in with the timed-out message at 0:00", async () => {
    const { container } = await signInTo(CHALLENGE);
    await screen.findByRole("form", { name: "Two-step verification form" });
    await advance(15 * 60_000 + 1_000);

    expect(screen.getByRole("form", { name: "Sign in form" })).toBeInTheDocument();
    expect(container.querySelector(".alert-success")).toHaveTextContent("Your sign-in timed out. Sign in again to continue.");
    expect(politeRegion(container)).toHaveTextContent("Your sign-in timed out. Sign in again to continue.");
    expect(screen.getByRole("heading", { name: "Sign in" })).toHaveFocus();
  });

  it("keeps a typed code, focuses the next code box and announces the extension", async () => {
    const { user, container } = await signInTo(CHALLENGE);
    await screen.findByRole("form", { name: "Two-step verification form" });
    await user.click(digit(1));
    await user.keyboard("123");
    await advance(13 * 60_000 + 1);

    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    await waitFor(() => expect(digit(4)).toHaveFocus());
    expect([1, 2, 3].map((n) => (digit(n) as HTMLInputElement).value)).toEqual(["1", "2", "3"]);
    expect(politeRegion(container)).toHaveTextContent("Sign-in extended. You have 15 minutes to enter your code.");
  });

  it("on first-time setup, shows the new QR code, clears the code and focuses the heading", async () => {
    const { user, container } = await signInTo(setupStep("FIRSTSECRET"));
    expect(await screen.findByText("FIRSTSECRET")).toBeInTheDocument();
    await user.click(digit(1));
    await user.keyboard("12");
    await advance(13 * 60_000 + 1);
    expect(screen.getByText(/scan the new QR code that appears/)).toBeInTheDocument();

    auth.signIn.mockResolvedValue(setupStep("SECONDSECRET"));
    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(await screen.findByText("SECONDSECRET")).toBeInTheDocument();
    expect((digit(1) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "Set up two-step verification" })).toHaveFocus();
    expect(politeRegion(container)).toHaveTextContent(/A new QR code and setup key are shown/);
  });

  it("sends a failed extension back to Sign in with focus on its heading", async () => {
    const { user } = await signInTo(CHALLENGE);
    await screen.findByRole("form", { name: "Two-step verification form" });
    await advance(13 * 60_000 + 1);
    auth.signIn.mockRejectedValue(Object.assign(new Error("expired"), { name: "NotAuthorizedException" }));

    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(await screen.findByRole("form", { name: "Sign in form" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toHaveFocus();
  });

  it("warns on Set new password too and keeps the typed new password", async () => {
    const { user } = await signInTo(NEW_PASSWORD, "Temp-pass1!");
    const input = await screen.findByLabelText(/New password/);
    await user.type(input, "Brand-new1!");
    await advance(13 * 60_000 + 1);

    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(auth.signIn.mock.calls[1][0]).toMatchObject({ password: "Temp-pass1!" });
    await waitFor(() => expect(screen.getByLabelText(/New password/)).toHaveFocus());
    expect(screen.getByLabelText(/New password/)).toHaveValue("Brand-new1!");
  });

  it("after Set new password, extends with the new password, not the temporary one", async () => {
    const { user } = await signInTo(NEW_PASSWORD, "Temp-pass1!");
    await user.type(await screen.findByLabelText(/New password/), "Brand-new1!");
    auth.confirmSignIn.mockResolvedValue(setupStep("FIRSTSECRET"));
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    await screen.findByText("FIRSTSECRET");

    await advance(13 * 60_000 + 1);
    auth.signIn.mockResolvedValue(setupStep("SECONDSECRET"));
    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(auth.signIn.mock.calls[1][0]).toMatchObject({ username: "user@example.com", password: "Brand-new1!" });
    expect(await screen.findByText("SECONDSECRET")).toBeInTheDocument();
  });
});
