import { describe, expect, it } from "vitest";
import { matchingJoin, planBackfill } from "../scripts/backfill-page-maps.mjs";

const line = (Text: string, Left: number, Top: number, Page = 1) => ({
  BlockType: "LINE",
  Text,
  Page,
  Geometry: { BoundingBox: { Left, Top, Width: Text.length * 0.01, Height: 0.01 } },
});

describe("page map backfill text match", () => {
  const lines = [line("Intro", 0.1, 0.05), line("A", 0.1, 0.1, 2), line("B", 0.3, 0.1, 2), line("C", 0.5, 0.1, 2)];

  it("matches text stored with table rows", () => {
    expect(matchingJoin("Intro\nA | B | C", lines)).toEqual({ text: "Intro\nA | B | C", pageStarts: [0, 6] });
  });

  it("matches text stored before tables were written row by row", () => {
    expect(matchingJoin("Intro\nA\nB\nC", lines)).toEqual({ text: "Intro\nA\nB\nC", pageStarts: [0, 6] });
  });

  it("matches nothing when the stored text differs", () => {
    expect(matchingJoin("Intro\nA B C", lines)).toBeNull();
  });
});

describe("page map backfill plan", () => {
  const grantKeys = ["A/NOFO-File-PDF", "B/NOFO-File-PDF", "C/NOFO-File-TXT", "D/NOFO-File-PDF", "E/NOFO-File-PDF", "E/raw-text.txt", "x/y/NOFO-File-PDF"];
  const artifactKeys = ["A/raw-text.txt", "B/raw-text.txt", "B/raw-text-pages.json", "C/raw-text.txt"];

  it("takes PDF grants with stored text and no map, including text still in the grant bucket", () => {
    expect(planBackfill(grantKeys, artifactKeys)).toEqual(["A", "E"]);
  });

  it("redoes mapped grants with force and narrows to one grant", () => {
    expect(planBackfill(grantKeys, artifactKeys, { force: true })).toEqual(["A", "B", "E"]);
    expect(planBackfill(grantKeys, artifactKeys, { only: "E" })).toEqual(["E"]);
  });
});
