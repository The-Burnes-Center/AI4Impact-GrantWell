export const pageMapKey = (nofoName) => `${nofoName}/raw-text-pages.json`;

/**
 * raw-text.txt from Textract LINE blocks, and the character offset where each page starts
 * (`pageStarts[i]` is page i + 1). Citations point at character offsets in raw-text.txt, so the
 * chat turns them into page numbers with this map.
 */
export function joinLines(lines) {
  const parts = [];
  const pageStarts = [];
  let length = 0;
  for (const line of lines) {
    const page = Number.isInteger(line.Page) && line.Page > 0 ? line.Page : 1;
    if (parts.length) length += 1;
    while (pageStarts.length < page) pageStarts.push(length);
    const text = line.Text ?? "";
    parts.push(text);
    length += text.length;
  }
  return { text: parts.join("\n"), pageStarts };
}

/** `chars` lets a reader tell the map belongs to the raw-text.txt it has. */
export const pageMap = (text, pageStarts) => ({ chars: text.length, pageStarts });

/** The page (1-based) holding character `index`. */
export function pageAt(pageStarts, index) {
  let low = 0;
  let high = pageStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (pageStarts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/** `pageStarts` when `map` was written for `text`, else null. */
export function usablePageStarts(map, text) {
  if (!map || map.chars !== text.length || !Array.isArray(map.pageStarts) || !map.pageStarts.length) return null;
  return map.pageStarts.every((n, i) => Number.isInteger(n) && n >= 0 && (i === 0 || n >= map.pageStarts[i - 1]))
    ? map.pageStarts
    : null;
}
