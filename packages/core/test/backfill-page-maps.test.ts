import { describe, expect, it } from "vitest";
import { planBackfill } from "../scripts/backfill-page-maps.mjs";

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
