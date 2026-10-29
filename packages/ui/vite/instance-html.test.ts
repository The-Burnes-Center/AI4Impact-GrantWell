import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "../src/common/release-notes-parse";
import { defaultBranding, type Branding } from "../src/common/branding";
import {
  chromeHasPublicHome,
  iconLink,
  iconType,
  landingFallback,
  notFoundHtml,
  whatsNewHtml,
  withoutLandingFallback,
  type Staged,
} from "./instance-html";

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
    expect(html).toContain("<h2>GrantWell v3.3.0</h2>");
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

describe("chromeHasPublicHome", () => {
  it("is true only when the chrome object names a PublicHome slot", () => {
    expect(chromeHasPublicHome("export const chrome: Chrome = { apiVersion: 1, Banner, Header, PublicHome };")).toBe(true);
    expect(
      chromeHasPublicHome(
        "// No slots: keeps GrantWell's own banner, header, footer and home page. PublicHome is not set.\nexport const chrome: Chrome = { apiVersion: 1 };"
      )
    ).toBe(false);
    expect(chromeHasPublicHome('import type { PublicHomeProps } from "../common/chrome-api";\nexport const chrome = { apiVersion: 1 };')).toBe(false);
  });
});

describe("landingFallback", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const staged = (branding: Partial<Branding>, single?: string): Staged => ({
    branding: { ...defaultBranding, appName: "GrantWell", supportEmail: "help@example.org", ...branding },
    ...(single ? { tenancy: "single" as const, states: [{ name: single }] } : {}),
  });

  it("empties #root when chrome ships its own PublicHome", () => {
    const html = landingFallback(index, staged({}, "Massachusetts"), true);
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("marketing__hero");
  });

  it("keeps the marketing fallback for a multi-state deployment", () => {
    expect(landingFallback(index, staged({}), false)).toBe(index);
    expect(landingFallback(index, undefined, false)).toBe(index);
  });

  it("renders the state page's copy for a single-state deployment, escaped, with its links", () => {
    const html = landingFallback(
      index,
      staged(
        {
          home: {
            tagline: "Grants for <Colorado>",
            attribution: [["Developed by ", { label: "AI for Impact", href: "https://example.org/a?b=1&c=2" }, "."]],
          },
        },
        "Colorado"
      ),
      false
    );
    expect(html).not.toContain("marketing__hero");
    expect(html).toContain("<h1>GrantWell</h1>");
    expect(html).toContain("<p>Grants for &lt;Colorado&gt;</p>");
    expect(html).toContain("GrantWell helps Colorado organizations discover");
    expect(html.match(/<h3>/g)).toHaveLength(3);
    expect(html).toContain('<h2 id="trust-heading">AI-powered, with you in control</h2>');
    expect(html).toContain('Developed by <a href="https://example.org/a?b=1&amp;c=2">AI for Impact</a>.');
    expect(html).toContain('<a href="/login">Sign in</a>');
    expect(html).toContain('// Only "/" is the landing page');
  });

  it("follows an explicit layout over the tenancy default", () => {
    expect(landingFallback(index, staged({ home: { layout: "marketing" } }, "Colorado"), false)).toBe(index);
    expect(landingFallback(index, staged({ home: { layout: "state" } }), false)).toContain("<h1>GrantWell</h1>");
  });
});

describe("favicon", () => {
  it("gets the MIME type of its extension", () => {
    expect(iconType("/images/brand/favicon.svg")).toBe("image/svg+xml");
    expect(iconType("/images/ma/favicon.PNG?v=2")).toBe("image/png");
    expect(iconType("/favicon.ico")).toBe("image/x-icon");
    expect(iconType("/favicon.webp")).toBeUndefined();
  });

  it("links no favicon as data:, and leaves the type off when it is unknown", () => {
    expect(iconLink("")).toBe('<link rel="icon" href="data:," />');
    expect(iconLink("/i/f.png")).toBe('<link rel="icon" href="/i/f.png" type="image/png" />');
    expect(iconLink("/i/f.webp")).toBe('<link rel="icon" href="/i/f.webp" />');
  });
});

describe("notFoundHtml", () => {
  it("names the deployment, uses its primary colour and has no scripts", () => {
    const html = notFoundHtml({ appName: "GrantWell <CO>", colors: { primary: "#001970" } });
    expect(html).toContain("<title>Page not found - GrantWell &lt;CO&gt;</title>");
    expect(html).toContain("Go to the GrantWell &lt;CO&gt; home page");
    expect(html).toContain("color: #001970");
    expect(html).not.toContain("<script");
  });

  it("falls back to the default colour for anything that isn't a hex colour", () => {
    expect(notFoundHtml({ appName: "X", colors: { primary: "red; } body { display: none" } })).toContain("color: #23776C");
  });
});
