import { afterEach, describe, expect, it } from "vitest";
import { caretShortfall, pinnedBarsHeight, scrollContainer, toolbarStickyTop } from "./pinned-bars";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--gw-editor-sticky-height");
});

describe("pinned toolbar geometry", () => {
  it("reads the pinned bars' height from the page", () => {
    expect(pinnedBarsHeight()).toBe(0);
    document.documentElement.style.setProperty("--gw-editor-sticky-height", "132px");
    expect(pinnedBarsHeight()).toBe(132);
  });

  it("finds the nearest scroll container, or none for the page", () => {
    document.body.innerHTML =
      '<div id="area" style="overflow-y: auto"><div id="card"><div id="toolbar"></div></div></div><div id="loose"><span id="free"></span></div>';
    expect(scrollContainer(document.getElementById("toolbar")!)?.id).toBe("area");
    expect(scrollContainer(document.getElementById("free")!)).toBeNull();
  });

  it("pins below the bars on the page, and below only their overlap inside an inner scroll container", () => {
    expect(toolbarStickyTop(120, null)).toBe(120);
    expect(toolbarStickyTop(120, 172)).toBe(0);
    expect(toolbarStickyTop(120, 40)).toBe(80);
  });

  it("asks for the caret to move below whichever is lower, the bars or a pinned toolbar", () => {
    expect(caretShortfall(300, 120, null)).toBeLessThan(0);
    expect(caretShortfall(130, 120, null)).toBe(6);
    expect(caretShortfall(150, 120, 170)).toBe(36);
    expect(caretShortfall(200, 120, 170)).toBeLessThan(0);
  });
});
