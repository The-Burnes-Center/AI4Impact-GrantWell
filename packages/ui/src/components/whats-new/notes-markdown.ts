import { createElement } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The page's own h1 is "What's new", so each entry's headings move down one level.
const SHIFTED = { h1: "h2", h2: "h3", h3: "h4", h4: "h5" } as const;

/** No JSX so the UI build can render the same markup into the static whats-new.html. */
export function notesMarkdown(markdown: string, shiftHeadings = true) {
  return createElement(
    Markdown,
    { remarkPlugins: [remarkGfm], components: shiftHeadings ? SHIFTED : undefined },
    markdown
  );
}
