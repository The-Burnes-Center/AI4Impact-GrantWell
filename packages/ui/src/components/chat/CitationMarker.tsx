import * as React from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "../../styles/chat.module.scss";
import { citationSource } from "./citations";
import type { ChatCitation } from "./types";

const EDGE_GAP_PX = 16;

/**
 * A numbered button after cited text that shows the quoted passage below it (disclosure pattern:
 * the quote follows the button in reading order). Escape or a click elsewhere closes it.
 */
export default function CitationMarker({ citation }: { citation: ChatCitation }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const popoverId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const source = citationSource(citation);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const hadFocus = wrapRef.current?.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) {
      setShift(0);
      return;
    }
    const rect = popoverRef.current.getBoundingClientRect();
    const overRight = rect.right - (window.innerWidth - EDGE_GAP_PX);
    const overLeft = EDGE_GAP_PX - rect.left;
    if (overRight > 0) setShift(-Math.min(overRight, rect.left - EDGE_GAP_PX));
    else if (overLeft > 0) setShift(overLeft);
  }, [open]);

  return (
    <span className={styles.citation} ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.citationMarker}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Quote ${citation.n}, ${source}`}
        onClick={() => setOpen((value) => !value)}
      >
        {citation.n}
      </button>
      {open && (
        <span
          id={popoverId}
          ref={popoverRef}
          className={styles.citationPopover}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          <span className={styles.citationQuote}>“{citation.quote}”</span>
          <span className={styles.citationSource}>{source}</span>
        </span>
      )}
    </span>
  );
}
