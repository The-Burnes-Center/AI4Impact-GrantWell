import React, { useState, useEffect, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { getCurrentUser } from "aws-amplify/auth";
import { LuFileText, LuDownload, LuArrowLeft, LuSquarePen, LuInfo, LuCircleCheckBig, LuTriangleAlert, LuChevronDown, LuEye } from "react-icons/lu";
import { readDraftCache, pollForExportUrl } from "../../common/helpers/document-editor-utils";
import {
  exportSections,
  grantSections,
  resolveApplicationSections,
  toSectionId,
  type ApplicationSection,
} from "../../common/helpers/application-sections";
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

const ReviewApplication: React.FC<ReviewApplicationProps> = ({
  selectedNofo,
  sessionId,
  onNavigate,
}) => {
  const [sections, setSections] = useState<ApplicationSection[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [completenessPassed, setCompletenessPassed] = useState(false);
  const [unviewedSections, setUnviewedSections] = useState<string[]>([]);
  const [stats, setStats] = useState({ wordCount: 0, pageCount: 0, complete: 0 });
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeContactDetails, setIncludeContactDetails] = useState(false);
  const [grantType, setGrantType] = useState<string | null>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
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
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
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
    const viewed = (readDraftCache<string[]>(sessionId, "sectionsViewed") || []).map(
      (key) => toSectionId(key, sections) ?? key
    );
    setUnviewedSections(sections.filter((s) => !viewed.includes(s.id)).map((s) => s.name));
  }, [sections, sessionId]);

  useEffect(() => {
    if (sections.length > 0) {
      const complete = sections.filter(
        (s) => (sectionAnswers[s.id] || "").trim().length > 0
      ).length;
      setCompletenessPassed(complete === sections.length);

      const allText = sections
        .map((s) => sectionAnswers[s.id] || "")
        .join(" ");
      const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
      const pageCount = Math.max(1, Math.round(wordCount / 300));
      setStats({ wordCount, pageCount, complete });
    }
  }, [sections, sectionAnswers]);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && exportDropdownOpen) {
        setExportDropdownOpen(false);
        const trigger = exportDropdownRef.current?.querySelector<HTMLElement>('[aria-haspopup]');
        trigger?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    if (exportDropdownOpen) {
      requestAnimationFrame(() => {
        const firstItem = exportDropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
        firstItem?.focus();
      });
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [exportDropdownOpen]);

  const handleExportMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      exportDropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prev]?.focus();
    }
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
    setExportDropdownOpen(false);
    exportTriggerRef.current?.focus();
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

  const completenessClass = completenessPassed
    ? "gw-alert--success"
    : "gw-alert--warning";

  return (
    <div className="ra-container">
      {/* Review Section */}
      <div className="ra-card">
        <div className="ra-header">
          <LuFileText className="ra-header__icon" aria-hidden="true" />
          <h2 className="ra-header__title">Review</h2>
        </div>

        <div className="ra-stats-grid">
          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--words">
              {stats.wordCount}
            </div>
            <div className="ra-stat-card__label">Total word count</div>
            <div className="ra-stat-card__sublabel">Across all sections</div>
          </div>

          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--pages">
              {stats.pageCount}
            </div>
            <div className="ra-stat-card__label">Estimated pages</div>
            <div className="ra-stat-card__sublabel">In PDF format</div>
          </div>

          <div className="ra-stat-card">
            <div className={`ra-stat-card__value ${completenessPassed ? "ra-stat-card__value--passed" : "ra-stat-card__value--incomplete"}`}>
              {stats.complete}/{sections.length}
            </div>
            <div className="ra-stat-card__label">Completion status</div>
            <div className="ra-stat-card__sublabel">Sections complete</div>
          </div>
        </div>

        {/* Completeness Check Message */}
        <div className={`gw-alert ${completenessClass} ra-compliance`}>
          {completenessPassed
            ? <LuCircleCheckBig size={20} aria-hidden="true" />
            : <LuTriangleAlert size={20} aria-hidden="true" />
          }
          <div>
            <h3 className="gw-alert__title">
              {completenessPassed
                ? "All sections complete"
                : "Some sections incomplete"}
            </h3>
            <p className="ra-compliance__text">
              {completenessPassed
                ? "All required sections have been completed. Review your content for accuracy and alignment with the grant requirements before exporting."
                : "Please complete all required sections before exporting your application."}
            </p>
          </div>
        </div>
      </div>

      {/* Before You Export Section */}
      <div className="ra-card">
        <h3 className="ra-export-section__title">Before you export</h3>

        {unviewedSections.length > 0 && (
          <div className="gw-alert gw-alert--warning ra-unviewed">
            <LuEye size={20} aria-hidden="true" />
            <div className="ra-unviewed__body">
              <h4 className="gw-alert__title">
                {unviewedSections.length === 1
                  ? "1 section hasn't been opened yet"
                  : `${unviewedSections.length} sections haven't been opened yet`}
              </h4>
              <p className="ra-unviewed__text">
                This content was drafted for you and never reviewed. You can still
                export, but reading it first is strongly recommended.
              </p>
              <ul className="ra-unviewed__list">
                {unviewedSections.map((name) => (
                  <li key={name} className="ra-unviewed__item">
                    {name}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onNavigate("sectionEditor")}
                className="gw-btn gw-btn--secondary"
              >
                Review these sections
              </button>
            </div>
          </div>
        )}

        <div className="ra-export-grid">
          <button
            onClick={() => onNavigate("sectionEditor")}
            className="ra-edit-btn"
          >
            <div className="ra-edit-btn__icon-wrapper">
              <LuSquarePen className="ra-edit-btn__icon" aria-hidden="true" />
            </div>
            <div className="ra-edit-btn__text">
              <div className="ra-edit-btn__title">Make final edits</div>
              <div className="ra-edit-btn__subtitle">
                Return to Section editor
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* What Happens After Export Section */}
      <div className="ra-info-section">
        <div className="ra-info-header">
          <LuInfo className="ra-info-header__icon" aria-hidden="true" />
          <h3 className="ra-info-header__title">
            What happens after export?
          </h3>
        </div>
        <ul className="ra-info-list">
          <li className="ra-info-list__item">
            You&apos;ll download a professionally formatted PDF of your
            application
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

      {exportingFormat && (
        <p className="ra-export-progress">
          <span className="ra-export-progress__spinner" aria-hidden="true" />
          {`Generating ${EXPORT_LABELS[exportingFormat]}…`}
        </p>
      )}

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

      <label className="ra-export-option">
        <input
          type="checkbox"
          checked={includeContactDetails}
          onChange={(e) => setIncludeContactDetails(e.target.checked)}
          disabled={exportingFormat !== null}
        />
        Include contact name and email on the cover page
      </label>

      {/* Action Buttons */}
      <div className="ra-actions">
        <button
          onClick={() => onNavigate("sectionEditor")}
          className="gw-btn gw-btn--secondary ra-back-btn"
        >
          <LuArrowLeft className="ra-back-btn__icon" aria-hidden="true" />
          Back to section editor
        </button>

        {/* Export As dropdown */}
        <div className="ra-export-dropdown" ref={exportDropdownRef}>
          <button
            id="ra-export-trigger"
            ref={exportTriggerRef}
            onClick={() => {
              if (exportingFormat === null) setExportDropdownOpen((o) => !o);
            }}
            disabled={!completenessPassed}
            // Stays focusable while busy: export moves focus here once the menu closes.
            aria-disabled={exportingFormat !== null || undefined}
            className="gw-btn gw-btn--primary ra-export-pdf-btn"
            aria-haspopup="menu"
            aria-expanded={exportDropdownOpen}
            aria-busy={exportingFormat !== null}
          >
            {exportingFormat ? (
              <>
                <span className="ra-export-pdf-btn__spinner" aria-hidden="true" />
                {`Generating ${EXPORT_LABELS[exportingFormat]}…`}
              </>
            ) : (
              <>
                <LuDownload className="ra-export-pdf-btn__icon" aria-hidden="true" />
                Export as
                <LuChevronDown
                  size={16}
                  style={{ marginLeft: "6px" }}
                  aria-hidden="true"
                />
              </>
            )}
          </button>

          {exportDropdownOpen && (
            <div
              className="ra-export-dropdown__menu"
              role="menu"
              tabIndex={-1}
              aria-labelledby="ra-export-trigger"
              onKeyDown={handleExportMenuKeyDown}
              // Tabbing out closes it, so an open menu is never left behind.
              onBlur={(e) => {
                if (!exportDropdownRef.current?.contains(e.relatedTarget as Node | null)) setExportDropdownOpen(false);
              }}
            >
              <button
                className="ra-export-dropdown__item"
                role="menuitem"
                onClick={() => runExport("pdf")}
                disabled={exportingFormat !== null}
              >
                <LuDownload size={14} aria-hidden="true" />
                PDF (.pdf)
              </button>
              <button
                className="ra-export-dropdown__item"
                role="menuitem"
                onClick={() => runExport("docx")}
                disabled={exportingFormat !== null}
              >
                <LuFileText size={14} aria-hidden="true" />
                Word Document (.docx)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReviewApplication;
