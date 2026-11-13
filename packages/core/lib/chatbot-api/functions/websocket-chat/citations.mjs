const QUOTE_MAX_CHARS = 600;

/** The page (1-based) holding character `index`, from extract-text's `pageStarts`. */
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

/** A page map that matches `text`, else null; a stale or missing map just means no page numbers. */
export function usablePageMap(map, text) {
  if (!map || map.chars !== text.length || !Array.isArray(map.pageStarts) || !map.pageStarts.length) return null;
  return map.pageStarts.every((n, i) => Number.isInteger(n) && n >= 0 && (i === 0 || n >= map.pageStarts[i - 1]))
    ? map.pageStarts
    : null;
}

function pagesOf(citation, documentInfo) {
  if (citation.type === "page_location") {
    const first = citation.start_page_number;
    const last = Math.max(first, (citation.end_page_number ?? first + 1) - 1);
    return Number.isInteger(first) ? { page: first, lastPage: last } : {};
  }
  if (citation.type === "char_location" && documentInfo?.pageStarts) {
    const first = pageAt(documentInfo.pageStarts, citation.start_char_index);
    const last = pageAt(documentInfo.pageStarts, Math.max(citation.start_char_index, citation.end_char_index - 1));
    return { page: first, lastPage: last };
  }
  return {};
}

/**
 * Numbered quotes for the UI from readStream's citations. The same passage cited twice keeps one
 * number. `documents[i]` describes the request's i-th document block: `{ title, pageStarts? }`.
 *
 * @returns {Array<{n: number, at: number[], quote: string, document: string, page?: number, lastPage?: number}>}
 */
export function numberCitations(found, documents) {
  const byPassage = new Map();
  const out = [];
  for (const { citation, at } of found) {
    const documentInfo = documents[citation.document_index];
    const quote = String(citation.cited_text ?? "").trim();
    if (!documentInfo || !quote) continue;
    const where = [citation.start_char_index, citation.end_char_index, citation.start_page_number, citation.end_page_number, citation.start_block_index];
    const key = `${citation.document_index}:${where.join(",")}`;
    let entry = byPassage.get(key);
    if (!entry) {
      entry = {
        n: out.length + 1,
        at: [],
        quote: quote.length > QUOTE_MAX_CHARS ? `${quote.slice(0, QUOTE_MAX_CHARS).trimEnd()}…` : quote,
        document: documentInfo.title,
        ...pagesOf(citation, documentInfo),
      };
      byPassage.set(key, entry);
      out.push(entry);
    }
    if (!entry.at.includes(at)) entry.at.push(at);
  }
  return out;
}
