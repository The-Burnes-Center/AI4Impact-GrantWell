import { describe, expect, it } from "vitest";
import { DEFAULT_COLORS, derivedTints, findContrastFailures, resolvePalette } from "./palette";

// Cases from packages/core/test/fixtures/palette.json, which also pins core's copy of this module.
describe("palette", () => {
  it("keeps the hand-tuned palette for the default primary", () => {
    expect(resolvePalette({ primary: "#23776C" })).toEqual(DEFAULT_COLORS);
    expect(derivedTints("#23776c")).toBeUndefined();
  });

  it("derives the missing shades of another primary", () => {
    expect(resolvePalette({ primary: "#001970" })).toEqual({
      primary: "#001970",
      primaryHover: "#00145A",
      primaryActive: "#000E3E",
      primaryLight: "#E0E3EE",
      accent: "#001970",
      accentHover: "#00155F",
    });
    expect(derivedTints("#001970")).toEqual({
      "--gw-color-primary-deep": "#001457",
      "--gw-color-primary-border": "#BFC6DB",
      "--gw-color-primary-muted": "#1A2652",
      "--gw-color-primary-alt": "#00186C",
      "--gw-color-primary-soft": "#808CB8",
      "--gw-color-primary-mid": "#405394",
    });
    expect(findContrastFailures({ primary: "#001970" })).toEqual([]);
  });

  it("keeps the shades a palette sets", () => {
    expect(resolvePalette({ primary: "#001970", primaryLight: "#E8EBF5", accent: "#245D38" })).toMatchObject({
      primaryLight: "#E8EBF5",
      accent: "#245D38",
      accentHover: "#1F4F30",
    });
  });

  it("reports every rule a light primary breaks", () => {
    expect(findContrastFailures({ primary: "#4CAF50" }).map(({ usage, ratio, required }) => ({ usage, ratio, required }))).toEqual([
      { usage: "text on the brand tint (hover/active rows, tabs, sort headers)", ratio: 3.73, required: 4.5 },
      { usage: "primary text and links", ratio: 2.77, required: 4.5 },
      { usage: "accent text", ratio: 3.74, required: 4.5 },
      { usage: "label on filled primary buttons", ratio: 2.77, required: 4.5 },
      { usage: "focus ring on light surfaces", ratio: 2.77, required: 3 },
      { usage: "focus ring on the brand tint", ratio: 2.48, required: 3 },
      { usage: "accent borders and outlines", ratio: 2.77, required: 3 },
    ]);
  });
});
