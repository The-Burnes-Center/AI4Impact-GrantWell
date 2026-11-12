import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "../../test/amplify";
import AuthPanel from "./AuthPanel";

afterEach(() => vi.useRealTimers());

describe("AuthPanel code step time limit (WCAG 2.2.1)", () => {
  it("warns 2 minutes before the 15-minute limit and keeps the sign-in going", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    auth.signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_TOTP_CODE" } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AuthPanel onAuthenticated={() => {}} />);

    const form = screen.getByRole("form", { name: "Sign in form" });
    await user.type(within(form).getByLabelText(/Email/), "user@example.com");
    await user.type(within(form).getByLabelText(/^Password/), "Password1!");
    await user.click(within(form).getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("form", { name: "Two-step verification form" })).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(12 * 60_000));
    expect(screen.queryByText(/times out in 2 minutes/)).toBeNull();
    await act(async () => vi.advanceTimersByTime(60_000 + 1));
    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent("this sign-in times out in 2 minutes");

    await user.click(screen.getByRole("button", { name: "Keep signing in" }));
    expect(auth.signIn).toHaveBeenCalledTimes(2);
    expect(auth.signIn.mock.calls[1][0]).toMatchObject({ username: "user@example.com", password: "Password1!" });
    expect(screen.queryByText(/times out in 2 minutes/)).toBeNull();
    expect(screen.getByRole("form", { name: "Two-step verification form" })).toBeInTheDocument();
  });
});
