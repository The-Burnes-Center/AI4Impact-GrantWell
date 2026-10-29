import { describe, expect, it } from "vitest";
import { defaultBranding, type Branding } from "./branding";
import { DEFAULT_TAGLINE, resolveHome } from "./home-copy";

const branding = (patch: Partial<Branding> = {}): Branding => ({ ...defaultBranding, ...patch });

describe("resolveHome", () => {
  it("picks the state layout for a single-state site and the marketing page otherwise", () => {
    expect(resolveHome(branding(), "Colorado").layout).toBe("state");
    expect(resolveHome(branding(), null).layout).toBe("marketing");
    expect(resolveHome(branding({ home: { layout: "marketing" } }), "Colorado").layout).toBe("marketing");
    expect(resolveHome(branding({ home: { layout: "state" } }), null).layout).toBe("state");
  });

  it("fills neutral defaults, naming the state when there is one", () => {
    const home = resolveHome(branding({ appName: "GrantWell" }), "Colorado");
    expect(home.tagline).toBe(DEFAULT_TAGLINE);
    expect(home.description).toMatch(/^GrantWell helps Colorado organizations/);
    expect(home.features.map((f) => f.title)).toEqual(["Discover", "Understand", "Draft"]);
    expect(resolveHome(branding(), null).description).not.toMatch(/helps\s+organizations.*Colorado/);
  });

  it("never says the service is free", () => {
    const home = resolveHome(branding(), "Colorado");
    const text = [home.tagline, home.description, home.trust.title, home.trust.text, ...home.features.flatMap((f) => [f.title, f.text])];
    expect(text.join(" ")).not.toMatch(/\bfree\b/i);
  });

  it("credits footer.madeBy and links the support email by default", () => {
    const home = resolveHome(
      branding({
        supportEmail: "help@example.org",
        footer: { partners: [], madeBy: { label: "AI for Impact", href: "https://example.org/ai4i" } },
      }),
      "Colorado"
    );
    expect(home.attribution).toEqual([
      ["Developed by ", { label: "AI for Impact", href: "https://example.org/ai4i" }, "."],
      ["Questions? Contact ", { label: "help@example.org", href: "mailto:help@example.org" }],
    ]);
    expect(resolveHome(branding(), "Colorado").attribution).toEqual([]);
  });

  it("uses every configured section as given", () => {
    const home = resolveHome(
      branding({
        home: {
          tagline: "T",
          description: "D",
          features: [
            { title: "a", text: "1" },
            { title: "b", text: "2" },
            { title: "c", text: "3" },
          ],
          trust: { title: "TT", text: "TX" },
          attribution: [["Only line"]],
        },
      }),
      "Colorado"
    );
    expect(home).toMatchObject({ tagline: "T", description: "D", trust: { title: "TT" }, attribution: [["Only line"]] });
    expect(home.features[2]).toEqual({ title: "c", text: "3" });
  });
});
