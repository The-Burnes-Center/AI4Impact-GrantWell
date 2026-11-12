import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoadingSpinner from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("shows its message at once but puts it in the status region only after the region exists", () => {
    vi.useFakeTimers();
    try {
      render(<LoadingSpinner message="Loading questions..." showMessage />);
      const region = screen.getByRole("status");
      expect(region).toBeEmptyDOMElement();
      expect(screen.getByText("Loading questions...")).toBeVisible();

      act(() => vi.advanceTimersByTime(150));
      expect(region).toHaveTextContent("Loading questions...");
    } finally {
      vi.useRealTimers();
    }
  });
});
