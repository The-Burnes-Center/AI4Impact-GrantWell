/**
 * Word-level diff between a snapshot's text and the current text. Changes are
 * marked with an icon plus underline/strikethrough as well as colour, so the
 * distinction survives for users who cannot see the colour.
 */
import React, { useMemo } from "react";
import { diffWords } from "diff";
import { Minus, Plus } from "lucide-react";

interface VersionDiffProps {
  /** Text as it was in the version being viewed. */
  previous: string;
  /** Text as it is now. */
  current: string;
  /** Describes what is being compared, for the summary line. */
  label?: string;
}

const VersionDiff: React.FC<VersionDiffProps> = ({ previous, current, label }) => {
  const parts = useMemo(() => diffWords(previous || "", current || ""), [previous, current]);

  const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count || 0), 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count || 0), 0);

  if (!previous && !current) {
    return <p className="vd-empty">This section was empty in both versions.</p>;
  }

  return (
    <div className="vd-root">
      <p className="vd-summary">
        {label ? `${label}: ` : ""}
        {added === 0 && removed === 0
          ? "No differences."
          : `${added} word${added === 1 ? "" : "s"} added since this version, ${removed} removed.`}
      </p>

      <div className="vd-body">
        {parts.map((part, index) => {
          if (part.added) {
            return (
              <ins key={index} className="vd-added">
                <Plus size={12} aria-hidden="true" className="vd-marker" />
                <span className="visually-hidden">Added: </span>
                {part.value}
              </ins>
            );
          }
          if (part.removed) {
            return (
              <del key={index} className="vd-removed">
                <Minus size={12} aria-hidden="true" className="vd-marker" />
                <span className="visually-hidden">Removed: </span>
                {part.value}
              </del>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </div>
    </div>
  );
};

export default VersionDiff;
