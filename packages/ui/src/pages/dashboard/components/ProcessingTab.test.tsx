import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NOFO } from "../../../common/types/nofo";
import ProcessingTab from "./ProcessingTab";

const grant = (name: string, processingStatus: NOFO["processingStatus"]): NOFO => ({
  id: 0, name, status: "active", isPinned: false, isRolling: false, expirationDate: null,
  grantType: null, agency: null, category: null, processingStatus,
});

const tab = (nofos: NOFO[]) => (
  <ProcessingTab nofos={nofos} onViewSummary={vi.fn()} onOpenReview={vi.fn()} onDismiss={vi.fn()} />
);

describe("ProcessingTab", () => {
  it("announces a new upload and later stage changes from one region that was already there", () => {
    const { rerender } = render(tab([]));
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(tab([grant("New Grant", "uploading")]));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("New Grant: Uploaded");

    rerender(tab([grant("New Grant", "extracting_text")]));
    expect(region).toHaveTextContent("New Grant: Extracting text");
  });

  it("stays quiet about grants already showing when the view opens", () => {
    render(tab([grant("Old Grant", "synthesizing")]));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
