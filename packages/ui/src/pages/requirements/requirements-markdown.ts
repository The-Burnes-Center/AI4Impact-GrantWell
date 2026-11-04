import type { ChatCitation } from "../../components/chat/types";

export interface TabText {
  markdown: string;
  citations: ChatCitation[];
}

type ApiItem = { item?: unknown; description?: unknown; citations?: unknown };
type ApiQuote = { quote?: unknown; page?: unknown; lastPage?: unknown };

const asText = (value: unknown, fallback: string) =>
  value === undefined ? fallback : typeof value === "object" ? JSON.stringify(value) : String(value);

/** One bullet per requirement; each quoted source gets a numbered marker after the item's text. */
export function requirementsMarkdown(items: ApiItem[] | undefined): TabText {
  if (!items || !Array.isArray(items)) return { markdown: "", citations: [] };
  const citations: ChatCitation[] = [];
  let markdown = "";
  items.forEach((section, i) => {
    if (i > 0) markdown += "\n";
    markdown += `- **${asText(section.item, "Unknown")}**: ${asText(section.description, "No description")}`;
    const quotes = Array.isArray(section.citations) ? (section.citations as ApiQuote[]) : [];
    for (const q of quotes) {
      if (typeof q?.quote !== "string" || !q.quote.trim()) continue;
      citations.push({
        n: citations.length + 1,
        at: [markdown.trimEnd().length],
        quote: q.quote,
        document: "Grant document",
        ...(typeof q.page === "number" && { page: q.page }),
        ...(typeof q.lastPage === "number" && { lastPage: q.lastPage }),
      });
    }
  });
  return { markdown, citations };
}

export const EMPTY_TAB: TabText = { markdown: "", citations: [] };
