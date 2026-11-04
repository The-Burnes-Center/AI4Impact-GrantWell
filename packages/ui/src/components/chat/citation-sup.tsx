import type { Components } from "react-markdown";
import CitationMarker from "./CitationMarker";
import type { ChatCitation } from "./types";

/** The markdown `sup` renderer that turns remarkCitationMarkers' placeholders into CitationMarkers. */
export function citationSup(citations: ChatCitation[]): Components["sup"] {
  const byNumber = new Map(citations.map((c) => [c.n, c]));
  return function CitationSup({ node, children, ...rest }) {
    const cite = node?.properties?.dataCite;
    if (typeof cite !== "string") return <sup {...rest}>{children}</sup>;
    return (
      <>
        {cite.split(" ").map((n) => {
          const citation = byNumber.get(Number(n));
          return citation ? <CitationMarker key={n} citation={citation} /> : null;
        })}
      </>
    );
  };
}
