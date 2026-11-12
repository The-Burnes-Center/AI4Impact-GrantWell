const FENCE = /^\s{0,3}(```|~~~)/;
const ATX_HEADING = /^(\s{0,3})(#{1,6})(?=\s|$)/;
const BOLD_LINE = /^\s{0,3}(\*\*|__)(?!\s)((?:(?!\1).)+?)(?<!\s)\1\s*:?\s*$/;

/**
 * The section title on the page is an h2, so section text uses only ### (Heading) and #### (Subheading).
 * Older drafts mark headings with bold-only lines or other levels; they are rewritten here.
 */
export function normalizeSectionMarkdown(markdown: string): string {
  if (!markdown) return markdown;
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(FENCE);
      if (fenceMatch) {
        if (fence === null) fence = fenceMatch[1];
        else if (fenceMatch[1] === fence) fence = null;
        return line;
      }
      if (fence !== null) return line;

      const heading = line.match(ATX_HEADING);
      if (heading) {
        const level = heading[2].length <= 3 ? "###" : "####";
        return `${heading[1]}${level}${line.slice(heading[0].length)}`;
      }

      const bold = line.match(BOLD_LINE);
      if (bold) {
        const text = bold[2].replace(/\s*:\s*$/, "").trim();
        if (text) return `### ${text}`;
      }
      return line;
    })
    .join("\n");
}
