export interface ReleaseEntry {
  version: string;
  /** The entry's markdown, from its `# GrantWell vX.Y.Z` heading up to the next one. */
  markdown: string;
  /** The bullet list under `## Highlights`, or "" when the entry has none. */
  highlights: string;
}

const HEADING = /^# GrantWell v(\d+\.\d+\.\d+)\s*$/gm;

/** Newest first, in file order. */
export function parseReleaseNotes(md: string): ReleaseEntry[] {
  const starts = [...md.matchAll(HEADING)];
  return starts.map((m, i) => {
    const markdown = md.slice(m.index, starts[i + 1]?.index ?? md.length).trim();
    const section = /^## Highlights\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(markdown);
    return { version: m[1], markdown, highlights: section ? section[1].trim() : "" };
  });
}
