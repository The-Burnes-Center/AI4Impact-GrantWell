import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import styles from "../../styles/chat.module.scss";
import { citationHeading, citationPage } from "./citations";
import { grantPdfHref, GRANT_DOCUMENT } from "../../common/grant-pdf";
import { useGrantPdfAvailable } from "../../hooks/use-grant-pdf";
import type { ChatCitation } from "./types";

const EDGE_GAP_PX = 16;

/** The part of the viewport the popover can show in: the window, cut down by any clipping ancestor. */
function visibleBounds(from: HTMLElement) {
  let top = 0;
  let left = 0;
  let right = window.innerWidth;
  let bottom = window.innerHeight;
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    top = Math.max(top, r.top);
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, left, right, bottom };
}

export interface CitationMarkerProps {
  citation: ChatCitation;
  /** The grant the answer is about; its citations link to the grant's PDF. */
  grant?: string;
  /** When given, selecting the marker calls it instead of opening the popover. */
  onSelect?: (citation: ChatCitation) => void;
}

/**
 * A numbered button after cited text. It opens a small non-modal dialog with the source, the quoted
 * passage and, for the grant, a link to that page of its PDF. Escape, the close button or a click
 * elsewhere closes it; Escape and the close button return focus to the marker.
 */
export default function CitationMarker({ citation, grant, onSelect }: CitationMarkerProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const [above, setAbove] = useState(false);
  const popoverId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const heading = citationHeading(citation);
  const page = citationPage(citation);
  const linksToGrant = Boolean(grant) && citation.document === GRANT_DOCUMENT && page !== undefined;
  const pdf = useGrantPdfAvailable(grant ?? "", open && linksToGrant);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

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

  useEffect(() => {
    if (open) popoverRef.current?.focus();
  }, [open]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || !popover) {
      setShift(0);
      setAbove(false);
      return;
    }
    const bounds = visibleBounds(popover);
    const rect = popover.getBoundingClientRect();
    const overRight = rect.right - (bounds.right - EDGE_GAP_PX);
    const overLeft = bounds.left + EDGE_GAP_PX - rect.left;
    if (overRight > 0) setShift(-Math.min(overRight, rect.left - bounds.left - EDGE_GAP_PX));
    else if (overLeft > 0) setShift(overLeft);
    const marker = buttonRef.current?.getBoundingClientRect();
    if (marker && rect.bottom > bounds.bottom - EDGE_GAP_PX && marker.top - bounds.top > rect.height + EDGE_GAP_PX) {
      setAbove(true);
    }
  }, [open, pdf]);

  return (
    <span className={styles.citation} ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.citationMarker}
        aria-expanded={onSelect ? undefined : open}
        aria-controls={open ? popoverId : undefined}
        aria-label={onSelect ? `Source ${citation.n}, show in the panel` : `Source ${citation.n}, ${heading}`}
        onClick={() => (onSelect ? onSelect(citation) : setOpen((value) => !value))}
      >
        {citation.n}
      </button>
      {open && (
        <span
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-label={`Source ${citation.n}`}
          tabIndex={-1}
          className={`${styles.citationPopover}${above ? ` ${styles.citationPopoverAbove}` : ""}`}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          <span className={styles.citationHeader}>
            <span className={styles.citationSource}>{heading}</span>
            <button
              type="button"
              className={styles.citationClose}
              aria-label={`Close source ${citation.n}`}
              onClick={() => close(true)}
            >
              <LuX size={18} aria-hidden="true" />
            </button>
          </span>
          <q className={styles.citationQuote}>{citation.quote}</q>
          {linksToGrant && pdf && grant && (
            <a className={styles.citationLink} href={grantPdfHref(grant, page)} target="_blank" rel="noopener noreferrer">
              Open the grant at page {page}{" "}
              <span className="visually-hidden">(opens in new tab)</span>
            </a>
          )}
        </span>
      )}
    </span>
  );
}
