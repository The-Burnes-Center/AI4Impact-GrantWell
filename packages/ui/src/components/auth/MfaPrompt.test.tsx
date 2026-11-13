import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import MfaPrompt from "./MfaPrompt";

describe("MfaPrompt", () => {
  it("after enrolment, Done carries the new dialog title and text", async () => {
    const user = userEvent.setup();
    render(<MfaPrompt />);

    const setItUp = await screen.findByRole("button", { name: "Set it up" });
    // The focus trap focuses the first button 100 ms after opening; typing before then loses digits.
    await waitFor(() => expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus());
    await user.click(setItUp);
    await screen.findByText("SECRET123");
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await user.click(screen.getByRole("button", { name: "Turn on two-step verification" }));

    const done = await screen.findByRole("button", { name: "Done" });
    expect(done).toHaveFocus();
    expect(done).toHaveAccessibleDescription(
      "Two-step verification is on. You will be asked for a code from your authenticator app the next time you sign in.",
    );
  });
});
