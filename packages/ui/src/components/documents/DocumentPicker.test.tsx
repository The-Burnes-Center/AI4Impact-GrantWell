import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/render";
import type { DocumentLibrary } from "../../hooks/use-document-library";
import DocumentPicker from "./DocumentPicker";

describe("DocumentPicker loading", () => {
  it("creates the status region before it says it is loading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const library = { documents: [], loading: true, uploading: false, loadError: null } as unknown as DocumentLibrary;
      renderApp(<DocumentPicker library={library} selected={null} onChange={() => {}} legend="Use in this application" />);
      const regions = screen.getAllByRole("status");
      expect(regions.some((r) => r.textContent?.includes("Loading your documents"))).toBe(false);

      await act(() => vi.advanceTimersByTimeAsync(150));
      expect(regions.some((r) => r.textContent === "Loading your documents...")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
