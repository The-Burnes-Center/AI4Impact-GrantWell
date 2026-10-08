import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "../src/common/release-notes-parse";
import { whatsNewHtml, withoutLandingFallback } from "./instance-html";

const notes = fs.readFileSync(path.join(__dirname, "..", "RELEASE_NOTES.md"), "utf8");
const releases = parseReleaseNotes(notes);

describe("whatsNewHtml", () => {
  const index = [
    "<html><head>",
    "<title>GrantWell | Home</title>",
    '<meta name="description" content="Home description" />',
    '<link rel="canonical" href="https://grantwell.us/" />',
    '<meta property="og:url" content="https://grantwell.us/" />',
    '<meta property="og:title" content="GrantWell | Home" />',
    '<meta property="og:description" content="Home description" />',
    '<script type="application/ld+json">{"@type":"WebApplication"}</script>',
    "</head><body>",
    '<div id="root"><div class="marketing">landing fallback</div></div>',
    "<script>",
    '  // Only "/" is the landing page; any other route would flash it before React mounts.',
    '  if (location.pathname !== "/") document.getElementById("root").replaceChildren();',
    "</script>",
    '<script type="module" src="/assets/index-abc.js"></script>',
    "</body></html>",
  ].join("\n");
  const html = whatsNewHtml(index, notes, "https://grantwell.us");

  it("gets its own title, description, canonical and share tags, without the app's JSON-LD", () => {
    expect(html).toContain("<title>What's new - GrantWell</title>");
    expect(html).toContain('<meta name="description" content="New features and improvements in each GrantWell release." />');
    expect(html).toContain('<link rel="canonical" href="https://grantwell.us/whats-new" />');
    expect(html).toContain('<meta property="og:url" content="https://grantwell.us/whats-new" />');
    expect(html).not.toContain("application/ld+json");
  });

  it("pre-renders every release in place of the landing fallback and keeps it only on /whats-new", () => {
    expect(html).not.toContain("landing fallback");
    expect(html.match(/<section>/g)).toHaveLength(releases.length);
    expect(html).toContain("<h2>GrantWell v3.0.0</h2>");
    expect(html).toContain('if (location.pathname !== "/whats-new")');
    expect(html).not.toContain('if (location.pathname !== "/")');
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
  });

  it("fails loudly if index.html loses the fallback it replaces", () => {
    expect(() => whatsNewHtml("<html></html>", notes)).toThrow(/#root fallback/);
  });
});

describe("withoutLandingFallback", () => {
  it("empties #root but keeps the route script whats-new.html relies on", () => {
    const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const html = withoutLandingFallback(index);
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("marketing__hero");
    expect(html).toContain('// Only "/" is the landing page');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
  });
});
