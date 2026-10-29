// Branding fields for the state home page, footer and manifest are checked at synth, before a bad value
// reaches the UI build.
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ENVS, appDir } from "../scripts/synth-ci.mjs";
import { validateInstanceConfig, type Branding, type InstanceConfig } from "../lib/config/instance-config";

let dev: InstanceConfig;
beforeAll(async () => {
  const instances: InstanceConfig[] = (await import(path.join(appDir, "config", "instances.ts"))).instances;
  dev = instances.find((i) => i.aws.environment === ENVS.dev.ENVIRONMENT)!;
});

const withBranding = (patch: (b: Branding) => Branding) => ({ ...dev, branding: patch(dev.branding) }) as InstanceConfig;
const card = (title: string) => ({ title, text: `${title} text` });

describe("branding validation", () => {
  it("accepts a fully configured home page, footer and short name", () => {
    const config = withBranding((b) => ({
      ...b,
      shortName: "GW Colorado",
      home: {
        layout: "state",
        tagline: "Find and apply for grants in Colorado",
        description: "GrantWell helps Colorado organizations find grants.",
        features: [card("Discover"), card("Understand"), card("Draft")],
        trust: { title: "AI-powered, you decide", text: "Every draft needs human review." },
        attribution: [["Developed by ", { label: "AI for Impact", href: "https://example.org" }, "."], ["Plain line"]],
      },
      footer: {
        ...b.footer,
        links: [{ label: "Contact", href: "mailto:help@example.org" }, { label: "Accessibility", href: "/accessibility" }],
        copyright: "State of Colorado",
        disclaimer: "Not an official grant portal.",
      },
      govHeader: { logo: b.logo, label: "Colorado", href: "https://colorado.gov", sealBesideLogo: false },
    }));
    expect(() => validateInstanceConfig(config)).not.toThrow();
  });

  it.each<[string, (b: Branding) => Branding, RegExp]>([
    ["an unknown layout", (b) => ({ ...b, home: { layout: "landing" as never } }), /home\.layout/],
    ["a blank tagline", (b) => ({ ...b, home: { tagline: " " } }), /home\.tagline/],
    ["two feature cards", (b) => ({ ...b, home: { features: [card("A"), card("B")] } }), /home\.features/],
    ["a card without text", (b) => ({ ...b, home: { features: [card("A"), card("B"), { title: "C", text: "" }] } }), /home\.features/],
    ["a trust panel without text", (b) => ({ ...b, home: { trust: { title: "T", text: "" } } }), /home\.trust/],
    ["an attribution link to http://", (b) => ({ ...b, home: { attribution: [[{ label: "x", href: "http://x" }]] } }), /attribution/],
    ["a footer link without a label", (b) => ({ ...b, footer: { ...b.footer, links: [{ label: "", href: "/x" }] } }), /footer\.links/],
    ["a blank copyright", (b) => ({ ...b, footer: { ...b.footer, copyright: "" } }), /footer\.copyright/],
    ["a 13-character short name", (b) => ({ ...b, shortName: "x".repeat(13) }), /shortName/],
  ])("rejects %s", (_name, patch, error) => {
    expect(() => validateInstanceConfig(withBranding(patch))).toThrow(error);
  });
});
