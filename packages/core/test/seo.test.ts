import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { seoFiles, writeSeoFiles } from "../lib/user-interface/seo-files";
import { SPA_ROUTING_CODE } from "../lib/user-interface/spa-routing";

let prod: InstanceConfig;
let dev: InstanceConfig;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  prod = instances.find((i) => i.id === "generic-prod")!;
  dev = instances.find((i) => i.id === "generic-dev")!;
});

describe("generated site files", () => {
  it("lets crawlers reach only the home page and what renders it on an indexable deployment", () => {
    const files = seoFiles(prod);
    expect(Object.keys(files).sort()).toEqual(["llms.txt", "manifest.json", "robots.txt", "sitemap.xml"]);
    expect(files["robots.txt"]).toBe(
      [
        "User-agent: *",
        "Allow: /$",
        "Allow: /whats-new$",
        "Allow: /assets/",
        "Allow: /images/",
        "Allow: /llms.txt",
        "Disallow: /",
        "",
        "Sitemap: https://grantwell.us/sitemap.xml",
        "",
      ].join("\n")
    );
    expect(files["sitemap.xml"]).toContain("<url><loc>https://grantwell.us/</loc></url>");
    expect(files["sitemap.xml"]).toContain("<url><loc>https://grantwell.us/whats-new</loc></url>");
    expect(files["llms.txt"]).toMatch(/^# GrantWell\n\n> GrantWell is an AI tool/);
    expect(files["llms.txt"]).toContain("- [Sign in](https://grantwell.us/login)");
    expect(files["llms.txt"]).not.toMatch(/\bfree\b/i);
  });

  it("blocks everything on dev, with no sitemap or llms.txt", () => {
    const files = seoFiles(dev);
    expect(Object.keys(files).sort()).toEqual(["manifest.json", "robots.txt"]);
    expect(files["robots.txt"]).toBe("User-agent: *\nDisallow: /\n");
  });

  it("builds the manifest from branding", () => {
    expect(JSON.parse(seoFiles(prod)["manifest.json"])).toEqual({
      name: "GrantWell",
      short_name: "GrantWell",
      description: prod.branding.seo!.description,
      start_url: "/",
      scope: "/",
      display: "browser",
      theme_color: "#23776C",
      background_color: "#ffffff",
      icons: [{ src: "/images/marketing/favicon.svg", sizes: "any", type: "image/svg+xml" }],
    });
  });

  it("fails when the instance ships its own copy", () => {
    const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "seo-"));
    fs.mkdirSync(path.join(appPath, "public"));
    fs.writeFileSync(path.join(appPath, "public", "robots.txt"), "User-agent: *\n");
    expect(() => writeSeoFiles(appPath, prod)).toThrow(/robots\.txt/);
    fs.rmSync(appPath, { recursive: true, force: true });
  });

  it("rejects indexable on a dev deployment", () => {
    expect(() => validateInstanceConfig({ ...dev, seo: { indexable: true } })).toThrow(/seo\.indexable/);
  });
});

describe("SPA routing function", () => {
  const handler = new Function(`${SPA_ROUTING_CODE}; return handler;`)() as (e: { request: { uri: string } }) => {
    uri: string;
  };
  const routed = (uri: string) => handler({ request: { uri } }).uri;

  it.each([
    "/",
    "/login",
    "/home",
    "/chat/0f8c2d6e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
    "/document-editor/0f8c2d6e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
    "/requirements/U.S.%20Rural%20Grants%20v2.0",
  ])("sends app route %s to /index.html", (uri) => {
    expect(routed(uri)).toBe("/index.html");
  });

  it.each(["/whats-new", "/whats-new/"])("sends %s to the pre-rendered /whats-new.html", (uri) => {
    expect(routed(uri)).toBe("/whats-new.html");
  });

  it("leaves other paths under /whats-new to the app", () => {
    expect(routed("/whats-new/extra")).toBe("/index.html");
  });

  it.each([
    "/whats-new.html",
    "/robots.txt",
    "/missing.txt",
    "/wp-login.php",
    "/.env",
    "/assets/index-abc123.js",
    "/images/marketing/og-image.jpg",
    "/.well-known/security.txt",
  ])("leaves file %s alone", (uri) => {
    expect(routed(uri)).toBe(uri);
  });
});

describe("whats-new.html upload", () => {
  const deployments = (env: keyof typeof ENVS) =>
    fs
      .readdirSync(outDir(env))
      .filter((f) => f.endsWith(".template.json"))
      .flatMap((f) => Object.values(JSON.parse(fs.readFileSync(path.join(outDir(env), f), "utf8")).Resources ?? {}) as any[])
      .filter((r) => r.Type === "Custom::CDKBucketDeployment");

  it.each(["prod", "dev"] as const)("ships with index.html under no-cache on %s, never under the 1-day rule", (env) => {
    const all = deployments(env);
    const entry = all.filter((d) => d.Properties.Include?.includes("whats-new.html"));
    expect(entry).toHaveLength(1);
    expect(entry[0].Properties.Include).toContain("index.html");
    expect(entry[0].Properties.SystemMetadata["cache-control"]).toBe("no-cache");
    const daily = all.filter((d) => d.Properties.SystemMetadata?.["cache-control"] === "public, max-age=86400");
    expect(daily).toHaveLength(1);
    expect(daily[0].Properties.Exclude).toContain("whats-new.html");
  });
});
