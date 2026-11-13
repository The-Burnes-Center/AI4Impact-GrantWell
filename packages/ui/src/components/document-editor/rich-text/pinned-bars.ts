/** Height of the editor page's pinned title bar and stepper, which DocumentEditorPage measures. */
export function pinnedBarsHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--gw-editor-sticky-height");
  return parseFloat(raw) || 0;
}

/** The element a sticky child sticks inside, or null for the page itself. */
export function scrollContainer(element: HTMLElement): HTMLElement | null {
  for (let el = element.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if ([overflowX, overflowY].some((value) => value !== "visible" && value !== "clip")) return el;
  }
  return null;
}

/**
 * Sticky `top` that puts the toolbar just below the pinned bars: their height on the page, or the part
 * of them that overlaps an inner scroll container.
 */
export function toolbarStickyTop(pinned: number, containerTop: number | null): number {
  return containerTop === null ? pinned : Math.max(0, pinned - containerTop);
}

/** How far the caret must move down to clear the pinned bars and a pinned toolbar, with a 16px gap. */
export function caretShortfall(caretTop: number, pinned: number, toolbarBottom: number | null): number {
  return Math.max(pinned, toolbarBottom ?? 0) + 16 - caretTop;
}
