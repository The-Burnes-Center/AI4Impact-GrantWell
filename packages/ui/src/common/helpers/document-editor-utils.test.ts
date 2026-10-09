import { describe, expect, it, vi } from "vitest";
import type { DraftJobStatus } from "../api-client/drafts-client";
import {
  clearDraftCache,
  pollForExportUrl,
  readDraftCache,
  statusToStep,
  stepToIndex,
  stepToStatus,
  writeDraftCache,
} from "./document-editor-utils";

describe("draft steps", () => {
  it("resumes a generating or reviewed draft on the right step", () => {
    expect(statusToStep("generating_draft")).toBe("sectionEditor");
    expect(statusToStep("submitted")).toBe("reviewApplication");
    expect(statusToStep("something_new")).toBe("projectBasics");
  });

  it("saves the review step as editing_sections, which the server knows", () => {
    expect(stepToStatus("reviewApplication")).toBe("editing_sections");
    expect(stepToStatus("unknown")).toBe("project_basics");
  });

  it("indexes steps in order and puts unknown steps first", () => {
    expect(stepToIndex("uploadDocuments")).toBe(2);
    expect(stepToIndex("nope")).toBe(0);
  });
});

describe("draft cache", () => {
  it("keeps each draft's edits apart", () => {
    writeDraftCache("a", "sections", { intro: "A" });
    writeDraftCache("b", "sections", { intro: "B" });
    expect(readDraftCache("a", "sections")).toEqual({ intro: "A" });
    clearDraftCache("a");
    expect(readDraftCache("a", "sections")).toBeNull();
    expect(readDraftCache("b", "sections")).toEqual({ intro: "B" });
  });

  it("reads nothing without a session and survives corrupt or unavailable storage", () => {
    expect(readDraftCache(null, "sections")).toBeNull();
    localStorage.setItem("gw:draft:a:sections", "{not json");
    expect(readDraftCache("a", "sections")).toBeNull();

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => writeDraftCache("a", "sections", {})).not.toThrow();
    setItem.mockRestore();
    warn.mockRestore();
  });
});

describe("pollForExportUrl", () => {
  const clock = () => {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number): Promise<void> => {
        t += ms;
      },
    };
  };
  const job = (status: DraftJobStatus["status"], extra: Partial<DraftJobStatus> = {}): DraftJobStatus => ({
    jobId: "j",
    status,
    ...extra,
  });

  it("returns the download link once the job completes", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce(job("in_progress"))
      .mockResolvedValueOnce(job("completed", { downloadUrl: "https://files.test/app.docx" }));
    await expect(pollForExportUrl({ poll, intervalMs: 1000, timeoutMs: 10_000, ...clock() })).resolves.toBe(
      "https://files.test/app.docx"
    );
  });

  it("gives up after repeated poll errors, naming the last one", async () => {
    const poll = vi.fn().mockRejectedValue(new Error("HTTP 502"));
    await expect(
      pollForExportUrl({ poll, intervalMs: 1000, timeoutMs: 60_000, maxConsecutiveErrors: 3, ...clock() })
    ).rejects.toThrow("Lost contact with the server while building the file (HTTP 502).");
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("times out with the last error when the job never finishes", async () => {
    const poll = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValue(job("in_progress"));
    await expect(pollForExportUrl({ poll, intervalMs: 1000, timeoutMs: 3000, ...clock() })).rejects.toThrow(
      "Timed out waiting for the export (last error: blip)."
    );
  });

  it("reports a server-side build error", async () => {
    const poll = vi.fn().mockResolvedValue(job("error", { error: "Template missing" }));
    await expect(pollForExportUrl({ poll, intervalMs: 1, timeoutMs: 10, ...clock() })).rejects.toThrow(
      "Template missing"
    );
  });
});
