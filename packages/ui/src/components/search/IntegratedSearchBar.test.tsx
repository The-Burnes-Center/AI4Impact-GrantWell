import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import IntegratedSearchBar from "./IntegratedSearchBar";

describe("IntegratedSearchBar", () => {
  it("reads the search tip as part of the field's description, not as a live region", async () => {
    const user = userEvent.setup();
    render(<IntegratedSearchBar onSelectDocument={vi.fn()} isLoading={false} onSearch={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "Search for grants" });
    expect(input).toHaveAccessibleDescription("Type a phrase to search grants by name, agency, or description.");

    await user.type(input, "housing");
    const tip = screen.getByText(/^Tip: Try a full sentence/);
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual(["search-help-text", tip.id]);
    expect(input).toHaveAccessibleDescription(expect.stringContaining("Tip: Try a full sentence for more precise results"));
    expect(tip.closest("[aria-live], [role=status], [role=alert]")).toBeNull();

    await user.type(input, " for rural families now");
    expect(screen.queryByText(/^Tip:/)).toBeNull();
    expect(input).toHaveAttribute("aria-describedby", "search-help-text");
  });
});
