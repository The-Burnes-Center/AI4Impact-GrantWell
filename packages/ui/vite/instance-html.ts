import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import { parseReleaseNotes } from "../src/common/release-notes-parse";
import { notesMarkdown } from "../src/components/whats-new/notes-markdown";
import type { Branding } from "../src/common/branding";
import type { Seo } from "../src/common/instance";

interface Staged {
  siteUrl?: string;
  seo?: Seo;
  branding: Branding;
}

const attr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tag = (name: string, attrs: Record<string, string>) =>
  `<${name} ${Object.entries(attrs).map(([k, v]) => `${k}="${attr(v)}"`).join(" ")} />`;

function headTags(staged: Staged | undefined, publicDir: string): Promise<string[]> | string[] {
  if (!staged?.seo || !staged.siteUrl) {
    return [`<title>GrantWell</title>`, tag("meta", { name: "robots", content: "noindex, nofollow" })];
  }
  const { siteUrl, seo, branding } = staged;
  const home = `${siteUrl}/`;
  const tags = [
    `<title>${attr(seo.title)}</title>`,
    tag("meta", { name: "description", content: seo.description }),
    ...(seo.indexable ? [] : [tag("meta", { name: "robots", content: "noindex, nofollow" })]),
    tag("link", { rel: "canonical", href: home }),
    tag("meta", { name: "theme-color", content: branding.colors.primary }),
    tag("meta", { property: "og:type", content: "website" }),
    tag("meta", { property: "og:site_name", content: branding.appName }),
    tag("meta", { property: "og:url", content: home }),
    tag("meta", { property: "og:title", content: seo.title }),
    tag("meta", { property: "og:description", content: seo.description }),
  ];
  const image = seo.ogImage ? `${siteUrl}${seo.ogImage.path}` : undefined;
  const jsonLd = () =>
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${home}#organization`,
          name: branding.orgName,
          email: branding.supportEmail,
          address: branding.postalAddress,
        },
        {
          "@type": "WebApplication",
          "@id": `${home}#app`,
          name: branding.appName,
          url: home,
          description: seo.description,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web browser",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          ...(image ? { image } : {}),
          provider: { "@id": `${home}#organization` },
        },
      ],
    }).replace(/</g, "\\u003c")}</script>`;

  if (!seo.ogImage || !image) {
    return [...tags, tag("meta", { name: "twitter:card", content: "summary" }), jsonLd()];
  }
  const { alt } = seo.ogImage;
  // X falls back to og:* for title, description and image.
  return sharp(path.join(publicDir, seo.ogImage.path)).metadata().then(({ width, height }) => [
    ...tags,
    tag("meta", { property: "og:image", content: image }),
    tag("meta", { property: "og:image:width", content: String(width) }),
    tag("meta", { property: "og:image:height", content: String(height) }),
    tag("meta", { property: "og:image:alt", content: alt }),
    tag("meta", { name: "twitter:card", content: "summary_large_image" }),
    jsonLd(),
  ]);
}

const ARROW =
  '<svg class="marketing__omni-arrow" aria-hidden="true" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M3.5 10.5L10.5 3.5M10.5 3.5H4.5M10.5 3.5V9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

/** Same markup as OmniHeader, so React's swap of the fallback doesn't move the page. */
type PageBranding = Pick<Branding, "appName" | "logo" | "favicon" | "omniPartners">;

/** Matches defaultBranding for builds with nothing staged. */
const UNSTAGED: PageBranding = { appName: "GrantWell", logo: "", favicon: "", omniPartners: [] };

function omniHeader(branding: PageBranding): string {
  if (branding.omniPartners.length === 0) return "";
  const links = branding.omniPartners.map(
    (p) =>
      `<a class="marketing__omni-link" href="${attr(p.href)}" target="_blank" rel="noreferrer noopener">${ARROW}<span>${attr(p.label)}</span><span class="visually-hidden"> (opens in new tab)</span></a>`
  );
  return `<aside class="marketing__omni" aria-label="Partner organizations (top)"><span class="marketing__omni-label">This is a tool by:</span>${links.join("")}</aside>`;
}

function heroLogo(branding: PageBranding): string {
  return branding.logo
    ? `<img class="marketing__hero-wordmark" src="${attr(branding.logo)}" alt="${attr(branding.appName)}" />`
    : `<span class="marketing__hero-wordmark">${attr(branding.appName)}</span>`;
}

const WHATS_NEW_TITLE = "What's new - GrantWell";
const WHATS_NEW_DESCRIPTION = "New features and improvements in each GrantWell release.";
const LANDING_ONLY_SCRIPT = '// Only "/" is the landing page';

/**
 * index.html retitled for /whats-new, with its own canonical and the release notes pre-rendered
 * into #root, so crawlers index the notes rather than a copy of the home page.
 */
export function whatsNewHtml(indexHtml: string, releaseNotes: string, siteUrl?: string, omni = ""): string {
  const rootStart = indexHtml.indexOf('<div id="root">');
  const marker = indexHtml.indexOf(LANDING_ONLY_SCRIPT);
  if (rootStart < 0 || marker < 0) throw new Error("whats-new.html: index.html no longer has the #root fallback");
  const scriptEnd = indexHtml.indexOf("</script>", marker) + "</script>".length;
  const notes = parseReleaseNotes(releaseNotes)
    .map((r) => `<section>${renderToStaticMarkup(notesMarkdown(r.markdown))}</section>`)
    .join("");
  const body =
    `<div id="root"><div class="marketing">${omni}<main id="main-content" tabindex="-1">` +
    `<div class="whats-new"><h1>What&#x27;s new</h1>${notes}</div></main></div></div>\n    <script>\n` +
    `      // whats-new.html is only served for /whats-new; any other route would flash these notes.\n` +
    `      if (location.pathname !== "/whats-new") document.getElementById("root").replaceChildren();\n    </script>`;
  const url = siteUrl ? `${siteUrl}/whats-new` : undefined;
  let html = indexHtml.slice(0, rootStart) + body + indexHtml.slice(scriptEnd);
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(WHATS_NEW_TITLE)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${attr(WHATS_NEW_DESCRIPTION)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${attr(WHATS_NEW_TITLE)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${attr(WHATS_NEW_DESCRIPTION)}"`)
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
  if (url) {
    html = html
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${attr(url)}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${attr(url)}"`);
  }
  return html;
}

/** Fills index.html from the instance core staged at synth: favicon, head tags, JSON-LD and the static landing fallback. */
export function instanceHtml(stagedInstancePath: string): Plugin {
  let publicDir = "";
  let root = "";
  let outDir = "";
  return {
    name: "instance-html",
    configResolved(config) {
      publicDir = config.publicDir;
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const staged: Staged | undefined = fs.existsSync(stagedInstancePath)
        ? JSON.parse(fs.readFileSync(stagedInstancePath, "utf8"))
        : undefined;
      const index = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      const notes = fs.readFileSync(path.join(root, "RELEASE_NOTES.md"), "utf8");
      fs.writeFileSync(path.join(outDir, "whats-new.html"), whatsNewHtml(index, notes, staged?.siteUrl, omniHeader(staged?.branding ?? UNSTAGED)));
    },
    async transformIndexHtml(html) {
      const staged: Staged | undefined = fs.existsSync(stagedInstancePath)
        ? JSON.parse(fs.readFileSync(stagedInstancePath, "utf8"))
        : undefined;
      const branding: PageBranding = staged?.branding ?? UNSTAGED;
      const head = await headTags(staged, publicDir);
      return html
        // "data:," asks the browser for no favicon at all, instead of a /favicon.ico 404.
        .replace("%GW_FAVICON%", attr(branding.favicon || "data:,"))
        .replace("<!-- %GW_HEAD% -->", head.join("\n    "))
        .replace("%GW_OMNI%", omniHeader(branding))
        .replace("%GW_HERO_LOGO%", heroLogo(branding))
        .replaceAll("%GW_APP_NAME%", attr(branding.appName));
    },
  };
}
