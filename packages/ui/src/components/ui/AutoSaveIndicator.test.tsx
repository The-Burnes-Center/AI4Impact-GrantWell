import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AutoSaveIndicator, { type SaveStatus } from "./AutoSaveIndicator";

const statusText = () => screen.getAllByRole("status").map((region) => region.textContent);

describe("AutoSaveIndicator announcements", () => {
  it("announces only Saved for a save, not the pending and saving steps", () => {
    const { rerender } = render(<AutoSaveIndicator status="idle" idleText="Saved" />);
    const steps: SaveStatus[] = ["pending", "saving"];
    for (const status of steps) {
      rerender(<AutoSaveIndicator status={status} idleText="Saved" />);
      expect(statusText()).toEqual([""]);
    }
    expect(screen.getByText("Saving...")).toBeVisible();

    rerender(<AutoSaveIndicator status="saved" idleText="Saved" />);
    expect(statusText()).toEqual(["Saved"]);

    rerender(<AutoSaveIndicator status="idle" idleText="Saved" />);
    expect(statusText()).toEqual([""]);
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("raises one alert on failure and keeps the retry button", () => {
    const { rerender } = render(<AutoSaveIndicator status="saving" onRetry={() => {}} />);
    rerender(<AutoSaveIndicator status="error" onRetry={() => {}} />);
    expect(screen.getAllByRole("alert").map((region) => region.textContent)).toEqual(["Not saved"]);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps its regions mounted while idle with no idle text, so the next save is an update", () => {
    const { rerender } = render(<AutoSaveIndicator status="idle" />);
    const region = screen.getByRole("status");
    rerender(<AutoSaveIndicator status="saved" />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Saved");
  });

  it("adds no regions for a visual-only copy", () => {
    render(<AutoSaveIndicator status="error" idleText="Saved" announce={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
