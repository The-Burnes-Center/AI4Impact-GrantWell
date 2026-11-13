import { useEffect, useRef } from "react";
import { Link } from "react-router";
import DocumentPicker from "../documents/DocumentPicker";
import { citationHeading, citationPage } from "./citations";
import { grantFacts, type GrantSummaryData } from "./grant-facts";
import { panelAnswer, type PanelAnswer } from "./chat-panel-context";
import type { ChatDocuments } from "../../hooks/use-chat-documents";
import { useGrantPdfAvailable } from "../../hooks/use-grant-pdf";
import { grantPdfHref, GRANT_DOCUMENT } from "../../common/grant-pdf";
import styles from "../../styles/chat.module.scss";

export type PanelTab = "facts" | "sources" | "documents";
const TABS: PanelTab[] = ["facts", "sources", "documents"];

export interface SourceFocus {
  reply: number;
  citation: number;
  token: number;
}

interface GrantPanelProps {
  /** Prefix for element ids, so the panel and the phone sheet can both exist. */
  idPrefix: string;
  label: string;
  grant: string;
  summary: GrantSummaryData | null;
  answers: PanelAnswer[];
  selectedReply: number | null;
  focus: SourceFocus | null;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  documents: ChatDocuments;
  /** Shown above the document list in the Documents tab: the documents' reading status. */
  documentsStatus?: React.ReactNode;
}

interface SourceCard {
  key: string;
  n?: number;
  heading: string;
  quote?: string;
  page?: number;
  isGrant: boolean;
}

function cardsFor(answer: PanelAnswer | null): SourceCard[] {
  if (!answer) return [];
  if (answer.citations.length) {
    return answer.citations.map((c) => ({
      key: `c${c.n}`,
      n: c.n,
      heading: `${c.n} · ${citationHeading(c)}`,
      quote: c.quote,
      page: citationPage(c),
      isGrant: c.document === GRANT_DOCUMENT,
    }));
  }
  return answer.sources.map((s, i) => {
    const isGrant = !s.uri.includes("userDocuments");
    return { key: `s${i}`, heading: isGrant ? "Grant" : s.title, isGrant };
  });
}

/** The chat's Grant panel: Facts, Sources and Documents tabs (automatic activation, arrow keys move). */
export default function GrantPanel({
  idPrefix,
  label,
  grant,
  summary,
  answers,
  selectedReply,
  focus,
  tab,
  onTab,
  documents,
  documentsStatus,
}: GrantPanelProps) {
  const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({ facts: null, sources: null, documents: null });
  const answer = panelAnswer(answers, selectedReply);
  const cards = cardsFor(answer);
  const pdf = useGrantPdfAvailable(grant, tab === "sources" && cards.some((c) => c.isGrant));
  const { library, selected, change, saveError } = documents;
  const ticked = selected?.length ?? 0;
  const total = library.documents.length;
  const docsKnown = selected !== null && !library.loading;
  const cardId = (key: string) => `${idPrefix}-source-${answer?.reply ?? 0}-${key}`;

  useEffect(() => {
    if (!focus || tab !== "sources") return;
    document.getElementById(`${idPrefix}-source-${focus.reply}-c${focus.citation}`)?.focus();
  }, [focus, tab, idPrefix]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.indexOf(tab);
    const next =
      event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length]
      : event.key === "ArrowLeft" ? TABS[(index - 1 + TABS.length) % TABS.length]
      : event.key === "Home" ? TABS[0]
      : event.key === "End" ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    onTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabProps = (key: PanelTab) => ({
    ref: (el: HTMLButtonElement | null) => {
      tabRefs.current[key] = el;
    },
    id: `${idPrefix}-tab-${key}`,
    type: "button" as const,
    role: "tab",
    "aria-selected": tab === key,
    "aria-controls": `${idPrefix}-panel-${key}`,
    tabIndex: tab === key ? 0 : -1,
    className: styles.panelTab,
    onClick: () => onTab(key),
    onKeyDown,
  });

  const panelProps = (key: PanelTab) => ({
    id: `${idPrefix}-panel-${key}`,
    role: "tabpanel",
    "aria-labelledby": `${idPrefix}-tab-${key}`,
    hidden: tab !== key,
    className: styles.panelBody,
  });

  return (
    <div className={styles.panel}>
      <div role="tablist" aria-label={label} className={styles.panelTabs}>
        <button {...tabProps("facts")}>Facts</button>
        <button {...tabProps("sources")} aria-label={`Sources, ${cards.length}`}>
          Sources <span className={styles.panelBadge} aria-hidden="true">{cards.length}</span>
        </button>
        <button
          {...tabProps("documents")}
          aria-label={docsKnown ? `Documents, ${ticked} of ${total} ticked` : "Documents"}
        >
          Documents
          {docsKnown && (
            <span className={`${styles.panelBadge} ${ticked ? styles.panelBadgeOn : ""}`} aria-hidden="true">
              {ticked}/{total}
            </span>
          )}
        </button>
      </div>

      <div {...panelProps("facts")}>
        <dl className={styles.facts}>
          {grantFacts(summary).map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value ?? <span className={styles.factMissing}>Not listed in the grant summary</span>}</dd>
            </div>
          ))}
        </dl>
        <Link to={`/requirements/${encodeURIComponent(grant)}`} className={styles.panelLink}>
          See all requirements
        </Link>
      </div>

      <div {...panelProps("sources")}>
        {answer && cards.length ? (
          <>
            {answer.question && <p className={styles.panelHint}>For the answer to “{answer.question}”</p>}
            {cards.map((card) => (
              <section key={card.key} id={cardId(card.key)} tabIndex={-1} className={styles.sourceCard} aria-labelledby={`${cardId(card.key)}-h`}>
                <h3 id={`${cardId(card.key)}-h`} className={styles.sourceCardHeading}>{card.heading}</h3>
                {card.quote && <blockquote className={styles.sourceCardQuote}>{card.quote}</blockquote>}
                {card.isGrant && pdf && (
                  <a className={styles.panelLink} href={grantPdfHref(grant, card.page)} target="_blank" rel="noopener noreferrer">
                    {card.page ? `Open the grant at page ${card.page}` : "Open the grant"}{" "}
                    <span className="visually-hidden">(opens in new tab)</span>
                  </a>
                )}
              </section>
            ))}
          </>
        ) : (
          <p className={styles.panelHint}>The grant passages and documents an answer used appear here.</p>
        )}
      </div>

      <div {...panelProps("documents")}>
        {documentsStatus}
        <DocumentPicker
          library={library}
          selected={selected}
          onChange={(keys) => void change(keys)}
          legend="Use in this chat"
          legendHidden
          variant="list"
          description="The AI reads only the documents you tick."
          documentIdentifier={grant}
        />
        {saveError && <p className="dm-error" role="alert">{saveError}</p>}
      </div>
    </div>
  );
}
