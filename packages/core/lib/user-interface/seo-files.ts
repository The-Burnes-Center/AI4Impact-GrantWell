import * as fs from "node:fs";
import * as path from "node:path";
import { InstanceConfig } from "../config/instance-config";

export interface ResolvedSeo {
  indexable: boolean;
  title: string;
  description: string;
  ogImage?: { path: string; alt: string };
}

export function resolveSeo(config: InstanceConfig): ResolvedSeo {
  const { appName, seo } = config.branding;
  return {
    indexable: config.seo?.indexable ?? false,
    title: seo?.title ?? appName,
    description: seo?.description ?? `${appName} helps you find, understand and apply for grants.`,
    ogImage: seo?.ogImage,
  };
}

const IMAGE_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function robotsTxt(config: InstanceConfig, seo: ResolvedSeo): string {
  if (!seo.indexable) return "User-agent: *\nDisallow: /\n";
  // Longest match wins, so these beat "Disallow: /": crawlers need the JS/CSS to render "/", and share previews need /images/.
  return [
    "User-agent: *",
    "Allow: /$",
    "Allow: /assets/",
    "Allow: /images/",
    "Allow: /llms.txt",
    "Disallow: /",
    "",
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(config: InstanceConfig): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url><loc>${xmlEscape(config.siteUrl)}/</loc></url>`,
    `</urlset>`,
    "",
  ].join("\n");
}

function manifestJson(config: InstanceConfig, seo: ResolvedSeo): string {
  const { appName, favicon, colors } = config.branding;
  const type = IMAGE_TYPES[path.extname(favicon).toLowerCase()];
  const manifest = {
    name: appName,
    short_name: appName,
    description: seo.description,
    start_url: "/",
    scope: "/",
    // Not a PWA: no service worker, nothing to install.
    display: "browser",
    theme_color: colors.primary,
    background_color: "#ffffff",
    icons: [{ src: favicon, sizes: "any", ...(type ? { type } : {}) }],
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

function llmsTxt(config: InstanceConfig, seo: ResolvedSeo): string {
  const { appName, orgName, supportEmail, postalAddress, footer } = config.branding;
  const lines = [
    `# ${appName}`,
    "",
    `> ${seo.description}`,
    "",
    `${appName} is run by ${orgName}. Everything except the home page needs a sign-in.`,
    "",
    "- Find the right grants: search for relevant state and federal grants aligned with your community needs.",
    "- Understand what's required: key information is extracted from each grant, and chat answers questions about eligibility and requirements.",
    "- Draft your application: step-by-step guidance and AI-assisted drafting.",
    "",
    "AI is a support tool, not a decision-maker: answers are grounded in official grant documents, and every draft needs human review before submission.",
    "",
    "## Links",
    `- [Home](${config.siteUrl}/)`,
    `- [Sign in](${config.siteUrl}/login)`,
    "",
    "## Contact",
    `- Email: ${supportEmail}`,
    `- Address: ${postalAddress}`,
  ];
  if (footer.partners.length) {
    lines.push("", "## Optional", ...footer.partners.map((p) => `- [${p.label}](${p.href})`));
  }
  return lines.join("\n") + "\n";
}

/** The site-root files core writes into the UI build, keyed by their path under public/. */
export function seoFiles(config: InstanceConfig): Record<string, string> {
  const seo = resolveSeo(config);
  const files: Record<string, string> = {
    "robots.txt": robotsTxt(config, seo),
    "manifest.json": manifestJson(config, seo),
  };
  if (seo.indexable) {
    files["sitemap.xml"] = sitemapXml(config);
    files["llms.txt"] = llmsTxt(config, seo);
  }
  return files;
}

/** Run after the instance overlay, so a state's own copy of one of these fails instead of being overwritten. */
export function writeSeoFiles(appPath: string, config: InstanceConfig): void {
  const publicRoot = path.join(appPath, "public");
  const files = seoFiles(config);
  const clashes = Object.keys(files).filter((f) => fs.existsSync(path.join(publicRoot, f)));
  if (clashes.length) {
    throw new Error(
      `GrantWell generates these from the instance config; remove them from public/: ${clashes.join(", ")}`
    );
  }
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(publicRoot, file), content);
  }
}
