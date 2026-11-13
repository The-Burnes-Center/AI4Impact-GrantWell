import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Components } from "react-markdown";
import { useApiClient } from "../../hooks/use-api-client";
import { getCurrentUser } from "aws-amplify/auth";
import { LuArrowLeft, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { readDraftCache, writeDraftCache, pollForExportUrl } from "../../common/helpers/document-editor-utils";
import {
  exportSections,
  grantSections,
  resolveApplicationSections,
  toSectionId,
  type ApplicationSection,
} from "../../common/helpers/application-sections";
import {
  findPlaceholders,
  isOverLimit,
  measureSection,
  pagesForWords,
  parseNarrativePageLimit,
  parseSectionLimit,
  remarkPlaceholderMarks,
  type SectionLimit,
  type TextMeasure,
} from "../../common/helpers/section-checks";
import { normalizeSectionMarkdown } from "../../components/document-editor/rich-text/section-markdown";
import ModelMarkdown from "../../components/common/ModelMarkdown";
import StepBand from "../../components/ui/StepBand";
import "../../styles/document-editor.css";

interface ReviewApplicationProps {
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
}

type ExportFormat = "pdf" | "docx";

const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  docx: "Word document",
};

const PDF_EXPORT_POLL_MS = 2000;
/** Must stay under the generator's own 5-minute Lambda timeout. */
const PDF_EXPORT_TIMEOUT_MS = 4 * 60 * 1000;

interface SectionCheck {
  section: ApplicationSection;
  text: string;
  drafted: boolean;
  opened: boolean;
  measure: TextMeasure;
  limit: SectionLimit | null;
  over: boolean;
  placeholders: number;
  status: string | null;
  warn: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const formatNumber = (n: number) => n.toLocaleString("en-US");

function statusOf(check: Omit<SectionCheck, "status" | "warn">): Pick<SectionCheck, "status" | "warn"> {
  if (!check.drafted) return { status: "Not drafted", warn: true };
  if (check.over) return { status: "Over limit", warn: true };
  if (!check.opened) return { status: "Not opened", warn: true };
  if (check.placeholders > 0) return { status: `${check.placeholders} to fill`, warn: false };
  return { status: null, warn: false };
}

function lengthLine({ measure, limit, over }: SectionCheck): string | null {
  if (!limit) return null;
  const unit = plural(limit.max, limit.unit.slice(0, -1), limit.unit);
  if (limit.unit === "pages") {
    return `About ${measure.pages} of ${formatNumber(limit.max)} ${unit}${over ? ", over the limit." : "."}`;
  }
  const used = measure[limit.unit];
  return `${formatNumber(used)} of ${formatNumber(limit.max)} ${unit}${over ? `, ${formatNumber(used - limit.max)} over.` : "."}`;
}

const PREVIEW_COMPONENTS: Components = {
  mark({ children }) {
    return (
      <mark className="ra-mark">
        <span className="visually-hidden">Placeholder: </span>
        {children}
      </mark>
    );
  },
  h1: ({ children }) => <h4>{children}</h4>,
  h2: ({ children }) => <h4>{children}</h4>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h5>{children}</h5>,
  h6: ({ children }) => <h5>{children}</h5>,
};

const PREVIEW_PLUGINS = [remarkPlaceholderMarks];

const ReviewApplication: React.FC<ReviewApplicationProps> = ({
  selectedNofo,
  sessionId,
  onNavigate,
}) => {
  const [sections, setSections] = useState<ApplicationSection[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [narrativePageLimit, setNarrativePageLimit] = useState<number | null>(null);
  const [sectionsSkipped, setSectionsSkipped] = useState<Record<string, string>>({});
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeContactDetails, setIncludeContactDetails] = useState(false);
  const [grantType, setGrantType] = useState<string | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusPreviewRef = useRef(false);
  const exportInFlightRef = useRef(false);
  const apiClient = useApiClient();

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!selectedNofo) return;

      try {
        const username = (await getCurrentUser()).username;

        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username,
        });

        if (currentDraft) {
          const result =
            await apiClient.landingPage.getNOFOSummary(selectedNofo, { forApplication: true });
          const resolved = resolveApplicationSections(
            grantSections(result?.data?.ProjectNarrativeSections),
            currentDraft.sections,
            currentDraft.sectionOrder
          );
          setSections(resolved.sections);
          setSectionAnswers(resolved.answers);
          setNarrativePageLimit(parseNarrativePageLimit(result?.data));
          setSectionsSkipped(currentDraft.sectionsSkipped ?? {});
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
      } finally {
        setLoaded(true);
      }
    };

    fetchDraftData();
  }, [apiClient, selectedNofo, sessionId]);

  useEffect(() => {
    if (!selectedNofo) return;
    let active = true;
    apiClient.landingPage
      .getNOFOs()
      .then((result: { nofoData?: Array<{ name: string; grant_type?: string | null }> }) => {
        const match = result?.nofoData?.find((n) => n.name === selectedNofo);
        if (active) setGrantType(match?.grant_type ?? null);
      })
      .catch(() => {
        /* the after-export steps fall back to the funder-neutral wording */
      });
    return () => {
      active = false;
    };
  }, [apiClient, selectedNofo]);

  useEffect(() => {
    if (sections.length === 0) return;
    setViewedIds(
      (readDraftCache<string[]>(sessionId, "sectionsViewed") || []).map((key) => toSectionId(key, sections) ?? key)
    );
    setSelectedId((current) => (current && sections.some((s) => s.id === current) ? current : sections[0].id));
  }, [sections, sessionId]);

  const checks = useMemo<SectionCheck[]>(
    () =>
      sections.map((section) => {
        const text = sectionAnswers[section.id] || "";
        const measure = measureSection(text);
        const limit = parseSectionLimit(section.name, section.description);
        const base = {
          section,
          text,
          drafted: text.trim().length > 0,
          opened: viewedIds.includes(section.id),
          measure,
          limit,
          over: !!limit && isOverLimit(measure, limit),
          placeholders: findPlaceholders(text).length,
        };
        return { ...base, ...statusOf(base) };
      }),
    [sections, sectionAnswers, viewedIds]
  );

  useEffect(() => {
    if (!focusPreviewRef.current) return;
    focusPreviewRef.current = false;
    previewHeadingRef.current?.focus();
  }, [selectedId]);

  const toCheck = checks.filter((c) => c.status).length;
  const narrativePages = pagesForWords(checks.reduce((total, c) => total + c.measure.words, 0));
  const summary = loaded
    ? [
        toCheck === 0 ? "Nothing to check" : `${toCheck} ${plural(toCheck, "thing")} to check`,
        narrativePageLimit
          ? `about ${narrativePages} of ${narrativePageLimit} narrative ${plural(narrativePageLimit, "page")}${
              narrativePages > narrativePageLimit ? ", over the limit" : ""
            }`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const selected = checks.find((c) => c.section.id === selectedId) ?? null;

  const markOpened = (id: string) => {
    const seen = readDraftCache<string[]>(sessionId, "sectionsViewed") || [];
    if (!seen.includes(id)) writeDraftCache(sessionId, "sectionsViewed", [...seen, id]);
    setViewedIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const chooseSection = (id: string) => {
    markOpened(id);
    if (id === selectedId) {
      previewHeadingRef.current?.focus();
      return;
    }
    focusPreviewRef.current = true;
    setSelectedId(id);
  };

  const editSection = (id: string) => {
    writeDraftCache(sessionId, "openSection", id);
    onNavigate("sectionEditor");
  };

  const fetchDraftForExport = async () => {
    if (!selectedNofo) return { draftData: null, grantName: null, resolved: null };
    const username = (await getCurrentUser()).username;
    const draftData = await apiClient.drafts.getDraft({ sessionId, userId: username });
    const nofoSummary = await apiClient.landingPage.getNOFOSummary(selectedNofo, { forApplication: true });
    const grantName = nofoSummary?.data?.GrantName || null;
    const resolved = draftData
      ? resolveApplicationSections(
          grantSections(nofoSummary?.data?.ProjectNarrativeSections),
          draftData.sections,
          draftData.sectionOrder
        )
      : null;
    return { draftData, grantName, resolved };
  };

  const downloadBlob = async (blob: Blob, filename: string) => {
    if (blob.type.includes("json") || blob.type.startsWith("text/")) {
      const detail = (await blob.text()).slice(0, 300);
      throw new Error(detail || "The server did not return a document.");
    }
    if (blob.size === 0) {
      throw new Error("The server returned an empty document.");
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    // Revoking in the same task as the click cancels the transfer in Chrome.
    window.setTimeout(() => {
      link.remove();
      window.URL.revokeObjectURL(url);
    }, 10000);
  };

  /** Cross-origin, so a `download` attribute is ignored; S3's Content-Disposition saves it. */
  const downloadFromUrl = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 10000);
  };

  const runExport = async (format: ExportFormat) => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;

    const label = EXPORT_LABELS[format];
    const filename = `grant-application.${format}`;
    setExportingFormat(format);
    setExportError(null);
    setExportStatus(`Generating ${label}. This may take a moment.`);

    try {
      const { draftData, grantName, resolved } = await fetchDraftForExport();
      if (!draftData || !resolved) throw new Error("No application data available for export.");

      const payload = {
        title: draftData.title,
        grantName: grantName || undefined,
        projectBasics: draftData.projectBasics,
        ...exportSections(resolved.sections, resolved.answers),
        includeContactDetails,
      };

      if (format === "docx") {
        await downloadBlob(await apiClient.drafts.generateDOCX(payload), filename);
      } else {
        let jobId: string | null = null;
        try {
          jobId = await apiClient.drafts.startPdfExport(payload);
        } catch (startError) {
          console.warn("Async PDF export unavailable, falling back to sync:", startError);
        }
        if (jobId) {
          const id = jobId;
          downloadFromUrl(
            await pollForExportUrl({
              poll: () => apiClient.drafts.pollDraftJob(id),
              intervalMs: PDF_EXPORT_POLL_MS,
              timeoutMs: PDF_EXPORT_TIMEOUT_MS,
            })
          );
        } else {
          await downloadBlob(await apiClient.drafts.generatePDF(payload), filename);
        }
      }

      setExportStatus(`${label} ready. Downloaded as ${filename}.`);
    } catch (error) {
      console.error(`Error generating ${label}:`, error);
      const detail = error instanceof Error ? error.message : String(error);
      const message = `${label} export failed. Your work is saved. Please try exporting again. (${detail})`;
      setExportError(message);
      setExportStatus(message);
    } finally {
      exportInFlightRef.current = false;
      setExportingFormat(null);
    }
  };

  const exportButton = (format: ExportFormat, text: string, variant: string) => (
    <button
      type="button"
      className={`gw-btn ${variant} ra-export-btn`}
      onClick={() => runExport(format)}
      // Stays focusable while busy, so focus is not lost from the button that was pressed.
      aria-disabled={exportingFormat !== null || undefined}
      aria-busy={exportingFormat === format || undefined}
    >
      {exportingFormat === format ? (
        <>
          <span className="ra-export-btn__spinner" aria-hidden="true" />
          {`Generating ${EXPORT_LABELS[format]}…`}
        </>
      ) : (
        text
      )}
    </button>
  );

  const selectedLength = selected ? lengthLine(selected) : null;

  return (
    <div className="ra-container">
      <StepBand
        title="Review"
        description={summary}
        className="ra-band"
        actions={
          <>
            {exportButton("docx", "Download Word", "gw-btn--inverse-outline")}
            {exportButton("pdf", "Download PDF", "gw-btn--inverse")}
          </>
        }
      />

      <div className="ra-export-bar">
        <label className="ra-export-option">
          <input
            type="checkbox"
            checked={includeContactDetails}
            onChange={(e) => setIncludeContactDetails(e.target.checked)}
            disabled={exportingFormat !== null}
          />
          Include contact name and email on the cover page
        </label>
        <p className="ra-export-note">You can download at any time. The checks below only point out what to look at.</p>
      </div>

      {exportError && (
        <div className="gw-alert gw-alert--urgent ra-export-error">
          <LuTriangleAlert className="ra-export-error__icon" aria-hidden="true" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Mounted before any export starts: a region that appears together with
          its first message is routinely missed by screen readers. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {exportStatus}
      </div>

      {checks.length > 0 && (
        <div className="ra-layout">
          <nav className="ra-sections" aria-label="Sections">
            <ul className="ra-sections__list">
              {checks.map((check) => {
                const current = check.section.id === selectedId;
                return (
                  <li key={check.section.id}>
                    <button
                      type="button"
                      className="ra-sections__item"
                      aria-current={current ? "true" : undefined}
                      onClick={() => chooseSection(check.section.id)}
                    >
                      <span className="ra-sections__name">{check.section.name}</span>
                      {check.status && (
                        <span className={check.warn ? "ra-sections__status ra-sections__status--warn" : "ra-sections__status"}>
                          <span className="visually-hidden">, </span>
                          {check.status}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {selected && (
            <section className="ra-preview" aria-labelledby="ra-preview-title">
              <div className="ra-preview__head">
                <h3 id="ra-preview-title" ref={previewHeadingRef} tabIndex={-1} className="ra-preview__title">
                  {selected.section.name}
                </h3>
                <button type="button" className="ra-preview__edit" onClick={() => editSection(selected.section.id)}>
                  Edit this section
                  <span className="visually-hidden">: {selected.section.name}</span>
                </button>
              </div>

              <p className="ra-preview__status">
                {!selected.drafted ? (
                  <strong className="ra-preview__warn">
                    {sectionsSkipped[selected.section.id] ? `${sectionsSkipped[selected.section.id].replace(/\.$/, "")}.` : "Not drafted yet."} Empty
                    sections are left out of the download.
                  </strong>
                ) : (
                  <>
                    {selectedLength &&
                      (selected.over ? (
                        <strong className="ra-preview__warn">{selectedLength}</strong>
                      ) : (
                        <span>{selectedLength}</span>
                      ))}
                    {!selected.opened && (
                      <strong className="ra-preview__warn">
                        {selectedLength ? " " : ""}Drafted for you and not opened yet.
                      </strong>
                    )}
                    {selected.placeholders > 0 && (
                      <span>
                        {selectedLength || !selected.opened ? " " : ""}
                        {`${selected.placeholders} ${plural(selected.placeholders, "placeholder")} to fill, highlighted below.`}
                      </span>
                    )}
                    {!selectedLength && selected.opened && selected.placeholders === 0 && (
                      <span>Nothing to check in this section.</span>
                    )}
                  </>
                )}
              </p>

              {selected.drafted && (
                <ModelMarkdown className="ra-preview__text" remarkPlugins={PREVIEW_PLUGINS} components={PREVIEW_COMPONENTS}>
                  {normalizeSectionMarkdown(selected.text)}
                </ModelMarkdown>
              )}
            </section>
          )}
        </div>
      )}

      <div className="ra-info-section">
        <div className="ra-info-header">
          <LuInfo className="ra-info-header__icon" aria-hidden="true" />
          <h3 className="ra-info-header__title">
            What happens after export?
          </h3>
        </div>
        <ul className="ra-info-list">
          <li className="ra-info-list__item">
            You&apos;ll download a formatted Word document or PDF of your application
          </li>
          {grantType === "federal" ? (
            <>
              <li className="ra-info-list__item">
                Submit the PDF through the official grants.gov portal
              </li>
              <li className="ra-info-list__item">
                Complete the SF-424 form separately (if required)
              </li>
            </>
          ) : (
            <>
              <li className="ra-info-list__item">
                Submit it through the funder&apos;s own application portal or process, as
                described in the grant&apos;s requirements
              </li>
              <li className="ra-info-list__item">
                Check the grant&apos;s Key deadlines so you submit on time
              </li>
            </>
          )}
        </ul>
      </div>

      <div className="ra-actions">
        <button
          type="button"
          onClick={() => onNavigate("sectionEditor")}
          className="gw-btn gw-btn--secondary ra-back-btn"
        >
          <LuArrowLeft className="ra-back-btn__icon" aria-hidden="true" />
          Back to section editor
        </button>
      </div>
    </div>
  );
};

export default ReviewApplication;
