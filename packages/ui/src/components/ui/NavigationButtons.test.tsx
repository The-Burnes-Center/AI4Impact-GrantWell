import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NavigationButtons from "./NavigationButtons";

describe("NavigationButtons busy state", () => {
  it("keeps the busy label visible beside a spinner drawn in the text colour, and ignores presses", async () => {
    const onContinue = vi.fn();
    render(<NavigationButtons showBack={false} onContinue={onContinue} continueLabel="Creating draft…" continueLoading />);
    const button = screen.getByRole("button", { name: "Creating draft…" });
    expect(button).toHaveTextContent("Creating draft…");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    const spinner = button.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(spinner.style.borderTopColor).toBe("currentcolor");
    expect(screen.getByRole("status")).toHaveTextContent("Creating draft…");

    await userEvent.setup().click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
