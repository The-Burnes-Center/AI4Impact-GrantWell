import { describe, expect, it } from "vitest";
import { legacySelection, readingNotes, uploadProblem, type LibraryDocument } from "./user-documents";

const MB = 1024 * 1024;
const doc = (name: string, size: number, lastModified: string, folder = "documents"): LibraryDocument => ({
  key: `user-1/${folder}/${name}`, name, folder, size, lastModified,
});

describe("user documents", () => {
  it("takes a pre-library selection from the grant's folder, both slash forms", () => {
    const library = [
      { ...doc("a.pdf", 1, "2026-11-01"), key: "user-1/Grant A//a.pdf", folder: "Grant A" },
      { ...doc("b.pdf", 1, "2026-11-01"), key: "user-1/Grant A/b.pdf", folder: "Grant A" },
      { ...doc("c.pdf", 1, "2026-11-01"), key: "user-1/Grant AB/c.pdf", folder: "Grant AB" },
      doc("d.pdf", 1, "2026-11-01"),
    ];
    expect(legacySelection(library, "user-1", "Grant A/")).toEqual(["user-1/Grant A//a.pdf", "user-1/Grant A/b.pdf"]);
    expect(legacySelection(library, "user-1", null)).toEqual([]);
  });

  it("rejects empty, oversized and unsupported uploads", () => {
    expect(uploadProblem({ name: "a.pdf", size: 0 })).toMatch(/empty \(0 bytes\)/);
    expect(uploadProblem({ name: "a.pdf", size: 101 * MB })).toMatch(/100 MB/);
    expect(uploadProblem({ name: "a.exe", size: 10 })).toMatch(/unsupported file type/);
    expect(uploadProblem({ name: "a.pdf", size: 10 })).toBeNull();
  });

  it("predicts what the AI skips, newest PDFs first against one budget", () => {
    const notes = readingNotes([
      doc("huge.pdf", 21 * MB, "2026-11-04"),
      doc("new.pdf", 15 * MB, "2026-11-03"),
      doc("old.pdf", 10 * MB, "2026-11-01"),
      doc("sheet.xlsx", 10, "2026-11-02"),
      doc("notes.txt", 10, "2026-11-02"),
    ]);
    expect(notes).toEqual({
      "user-1/documents/huge.pdf": "Too large for the AI to read",
      "user-1/documents/old.pdf": "Skipped: the other selected files use up what the AI can read at once",
      "user-1/documents/sheet.xlsx": "The AI can't read this file type",
    });
  });
});
