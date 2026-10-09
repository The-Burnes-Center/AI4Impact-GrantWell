import { describe, expect, it } from "vitest";
import notes from "../../RELEASE_NOTES.md?raw";
import { parseReleaseNotes } from "./release-notes-parse";

const releases = parseReleaseNotes(notes);

describe("parseReleaseNotes", () => {
  it("splits on release headings, newest first, and pulls out Highlights", () => {
    const parsed = parseReleaseNotes(
      "# GrantWell v2.0.0\n\nIntro\n\n## Highlights\n\n- A\n- B\n\n## Details\n\nMore\n\n# GrantWell v1.0.0\n\n## Highlights\n\n- C\n"
    );
    expect(parsed.map((r) => r.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(parsed[0].highlights).toBe("- A\n- B");
    expect(parsed[0].markdown).toContain("## Details");
    expect(parsed[0].markdown).not.toContain("v1.0.0");
    expect(parsed[1].highlights).toBe("- C");
  });

  it("gives an entry without Highlights empty highlights", () => {
    expect(parseReleaseNotes("# GrantWell v1.2.3\n\nJust text\n")[0].highlights).toBe("");
  });
});

describe("RELEASE_NOTES.md", () => {
  it("lists releases newest first", () => {
    expect(releases.map((r) => r.version)).toEqual(["3.2.0", "3.1.0", "3.0.0", "2.0.0", "1.0.0"]);
  });

  it("keeps every release's Highlights short enough for the dialog", () => {
    for (const r of releases) {
      const bullets = r.highlights.split("\n").filter(Boolean);
      expect(bullets.length, r.version).toBeGreaterThan(0);
      expect(bullets.length, r.version).toBeLessThanOrEqual(8);
      for (const b of bullets) expect(b, r.version).toMatch(/^- /);
    }
  });

  it("uses the agreed vocabulary", () => {
    for (const word of [/\bNOFOs?\b/i, /\bsessions?\b/i, /\bfree\b/i, /\bCognito\b/, /\bLambda\b/, /\bdrafts\b/i]) {
      expect(notes).not.toMatch(word);
    }
  });
});
