import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ProjectBasics from "./ProjectBasics";

const HINT = "Enter the amount in numbers only, for example 25000";

describe("ProjectBasics requested amount", () => {
  it("says to use numbers when letters are typed, then clears once the amount is valid", () => {
    render(<ProjectBasics onContinue={vi.fn()} />);
    const amount = screen.getByLabelText(/Requested Amount/);

    fireEvent.change(amount, { target: { value: "abc" } });
    expect(screen.getByRole("alert")).toHaveTextContent(HINT);
    expect(amount).toHaveValue("");

    fireEvent.change(amount, { target: { value: "25000" } });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(amount).toHaveValue("25000");
  });
});
