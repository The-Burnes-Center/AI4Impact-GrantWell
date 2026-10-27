import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir, outDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type InstanceConfig } from "../lib/config/instance-config";
import { seoFiles, writeSeoFiles } from "../lib/user-interface/seo-files";
import { SPA_ROUTING_CODE, spaRoutingCode } from "../lib/user-interface/spa-routing";

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

  it.each([["grantwell.us"], ["WWW.grantwell.us"], ["https://www.grantwell.us"]])(
    "rejects redirect domain %s",
    (bad) => {
      const customDomain = { ...prod.customDomain!, redirectDomains: [bad] };
      expect(() => validateInstanceConfig({ ...prod, customDomain })).toThrow(/redirectDomains/);
    }
  );
});

describe("SPA routing function", () => {
  type Request = { uri: string; headers: Record<string, { value: string }>; querystring: Record<string, unknown> };
  const load = (code: string) => new Function(`${code}; return handler;`)() as (e: { request: Request }) => {
    uri?: string;
    statusCode?: number;
    headers: { location?: { value: string } };
  };
  const handler = load(SPA_ROUTING_CODE);
  const request = (uri: string, host = "grants.example.gov", querystring = {}) => ({
    request: { uri, headers: { host: { value: host } }, querystring },
  });
  const routed = (uri: string) => handler(request(uri)).uri;

  it.each([
    "/",
    "/login",
    "/home",
    "/home/",
    "/Home",
    "/profile",
    "/admin",
    "/admin/dashboard",
    "/chat/sessions",
    "/chat/0f8c2d6e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
    "/document-editor",
    "/document-editor/drafts",
    "/document-editor/0f8c2d6e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
    "/requirements/U.S.%20Rural%20Grants%20v2.0",
    "/requirements/FY%202025%20Grant.pdf",
    "/requirements/Parks%20%2F%20Recreation",
  ])("sends app route %s to /index.html", (uri) => {
    expect(routed(uri)).toBe("/index.html");
  });

  it.each(["/whats-new", "/whats-new/"])("sends %s to the pre-rendered /whats-new.html", (uri) => {
    expect(routed(uri)).toBe("/whats-new.html");
  });

  it.each([
    "/whats-new/extra",
    "/nope",
    "/homepage",
    "/chat",
    "/chat/",
    "/requirements",
    "/requirements/",
    "/requirements/a/b",
    "/document-editor/0f8c2d6e/extra",
    "/unsubscribe",
    "/auth/callback",
    "/wp-admin/setup-config",
    "//home",
  ])("leaves unknown path %s for the bucket to 404", (uri) => {
    expect(routed(uri)).toBe(uri);
  });

  it.each([
    "/whats-new.html",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/404.html",
    "/missing.txt",
    "/wp-login.php",
    "/.env",
    "/assets/index-abc123.js",
    "/images/marketing/og-image.jpg",
    "/.well-known/security.txt",
  ])("leaves file %s alone", (uri) => {
    expect(routed(uri)).toBe(uri);
  });

  describe("with redirect hosts", () => {
    const redirecting = load(spaRoutingCode({ from: ["www.grants.example.gov"], to: "grants.example.gov" }));

    it("sends a redirect host to the same path and query on the canonical host", () => {
      const response = redirecting(
        request("/requirements/U.S.%20Grants", "WWW.grants.example.gov", {
          utm_source: { value: "mail" },
          tag: { value: "a", multiValue: [{ value: "a" }, { value: "b" }] },
          flag: { value: "" },
        })
      );
      expect(response.statusCode).toBe(301);
      expect(response.headers.location?.value).toBe(
        "https://grants.example.gov/requirements/U.S.%20Grants?utm_source=mail&tag=a&tag=b&flag"
      );
    });

    it("routes the canonical host as usual", () => {
      expect(redirecting(request("/home")).uri).toBe("/index.html");
    });

    it("never redirects without redirect hosts", () => {
      expect(handler(request("/home", "www.grants.example.gov")).uri).toBe("/index.html");
    });
  });

  it("fits CloudFront Functions' 10 KB code limit", () => {
    expect(Buffer.byteLength(SPA_ROUTING_CODE)).toBeLessThan(10 * 1024);
  });
});

const resources = (env: keyof typeof ENVS) =>
  fs
    .readdirSync(outDir(env))
    .filter((f) => f.endsWith(".template.json"))
    .flatMap((f) => Object.values(JSON.parse(fs.readFileSync(path.join(outDir(env), f), "utf8")).Resources ?? {}) as any[]);

describe("unknown paths", () => {
  it.each(["prod", "dev"] as const)("get /404.html with a 404 from the distribution on %s", (env) => {
    const dists = resources(env).filter((r) => r.Type === "AWS::CloudFront::Distribution");
    expect(dists).toHaveLength(1);
    expect(dists[0].Properties.DistributionConfig.CustomErrorResponses).toEqual([
      { ErrorCachingMinTTL: 0, ErrorCode: 404, ResponseCode: 404, ResponsePagePath: "/404.html" },
    ]);
  });
});

describe("whats-new.html upload", () => {
  const deployments = (env: keyof typeof ENVS) =>
    resources(env).filter((r) => r.Type === "Custom::CDKBucketDeployment");

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
