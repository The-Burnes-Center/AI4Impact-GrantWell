import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectBasics from "./ProjectBasics";

const HINT = "Enter the amount in numbers only, for example 25000";

describe("ProjectBasics requested amount", () => {
  it("says to use numbers when letters are typed, then clears once the amount is valid", () => {
    render(<ProjectBasics onContinue={vi.fn()} />);
    const amount = screen.getByLabelText(/Requested amount/);

    fireEvent.change(amount, { target: { value: "abc" } });
    expect(screen.getAllByRole("status").some((region) => region.textContent === HINT)).toBe(true);
    expect(amount).toHaveAccessibleDescription(expect.stringContaining(HINT));
    expect(amount).toHaveValue("");

    fireEvent.change(amount, { target: { value: "25000" } });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(amount).toHaveValue("25000");
  });
});

describe("ProjectBasics requested amount label", () => {
  it("names the currency in the label, keeps the $ out of the name, and uses the label in the summary", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    render(<ProjectBasics onContinue={vi.fn()} />);
    const amount = screen.getByRole("textbox", { name: "Requested amount (USD)" });
    expect(screen.getByText("$")).toHaveAttribute("aria-hidden", "true");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Requested amount (USD): This field is required" }));
    expect(amount).toHaveFocus();
  });
});

describe("ProjectBasics error summary focus", () => {
  it("leaves focus on the next field when an error appears on blur", async () => {
    const user = userEvent.setup();
    render(<ProjectBasics onContinue={vi.fn()} />);
    const name = screen.getByLabelText(/Project name/);

    await user.click(name);
    await user.tab();

    expect(screen.getByText(/There is 1 error in this form/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Organization name/)).toHaveFocus();
    expect(name).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps focus in the field while typing changes the error count", async () => {
    const user = userEvent.setup();
    render(<ProjectBasics onContinue={vi.fn()} />);
    const name = screen.getByLabelText(/Project name/);
    await user.click(name);
    await user.tab();
    await user.tab();

    await user.click(name);
    expect(screen.getByText(/There are 3 errors in this form/)).toBeInTheDocument();
    await user.type(name, "Main street");
    expect(name).toHaveFocus();
    expect(screen.getByText(/There are 2 errors in this form/)).toBeInTheDocument();
  });

  it("moves focus to the summary on Continue, every time, without an alert per field", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<ProjectBasics onContinue={onContinue} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const summary = screen.getByText(/There are 7 errors in this form/).parentElement!;
    expect(summary).toHaveFocus();
    expect(screen.queryAllByRole("alert").filter((region) => region.textContent)).toEqual([]);
    const email = screen.getByLabelText(/Contact email/);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(expect.stringContaining("This field is required"));

    await user.click(email);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(summary).toHaveFocus();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
