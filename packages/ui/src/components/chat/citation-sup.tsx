import type { Components } from "react-markdown";
import CitationMarker from "./CitationMarker";
import type { ChatCitation } from "./types";

export interface CitationSupOptions {
  /** The grant the text is about, for links to its PDF. */
  grant?: string;
  /** Selecting a marker calls this instead of opening its popover. */
  onSelect?: (citation: ChatCitation) => void;
}

/** The markdown `sup` renderer that turns remarkCitationMarkers' placeholders into CitationMarkers. */
export function citationSup(citations: ChatCitation[], { grant, onSelect }: CitationSupOptions = {}): Components["sup"] {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  return function CitationSup({ node, children, ...rest }) {
    const cite = node?.properties?.dataCite;
    if (typeof cite !== "string") return <sup {...rest}>{children}</sup>;
    return (
      <>
        {cite.split(" ").map((n) => {
          const citation = byNumber.get(Number(n));
          return citation ? <CitationMarker key={n} citation={citation} grant={grant} onSelect={onSelect} /> : null;
        })}
      </>
    );
  };
}
