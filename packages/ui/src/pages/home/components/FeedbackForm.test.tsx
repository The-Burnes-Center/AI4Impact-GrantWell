import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FeedbackForm from "./FeedbackForm";

describe("FeedbackForm", () => {
  it.each([
    ["Yes", "If you have any suggestions for the website, please let us know."],
    ["No", "How can we improve the page? required"],
  ])("labels the textarea with its visible prompt after %s", async (answer, name) => {
    const user = userEvent.setup();
    const { container } = render(<FeedbackForm />);
    await user.click(screen.getByLabelText(answer));

    const textarea = screen.getByRole("textbox", { name });
    expect(container.querySelectorAll('label[for="feedback-text"]')).toHaveLength(1);
    expect(container.querySelector('label[for="feedback-text"]')).not.toHaveClass("visually-hidden");
    expect(textarea).toHaveAttribute("id", "feedback-text");
  });

  it("re-announces the same validation error on a repeat submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FeedbackForm />);

    await user.click(screen.getByLabelText("No"));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    const first = screen.getByRole("alert");
    expect(first).toHaveTextContent("Please tell us how we can improve the page.");

    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => vi.advanceTimersByTime(100));
    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent("Please tell us how we can improve the page.");
    expect(second).not.toBe(first);
  });
});
