import React, { useState, useEffect, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { getCurrentUser } from "aws-amplify/auth";
import { LuFileText, LuDownload, LuArrowLeft, LuSquarePen, LuInfo, LuCircleCheckBig, LuTriangleAlert, LuChevronDown, LuEye } from "react-icons/lu";
import { readDraftCache, pollForExportUrl } from "../../common/helpers/document-editor-utils";
import "../../styles/document-editor.css";

interface ReviewApplicationProps {
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
}

interface Section {
  name: string;
  description: string;
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
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [completenessPassed, setCompletenessPassed] = useState(false);
  const [unviewedSections, setUnviewedSections] = useState<string[]>([]);
  const [stats, setStats] = useState({ wordCount: 0, pageCount: 0, complete: 0 });
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
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
          if (currentDraft.sections) {
            setSectionAnswers(currentDraft.sections);
          }

          const result =
            await apiClient.landingPage.getNOFOSummary(selectedNofo);
          if (result?.data?.ProjectNarrativeSections) {
            const apiSections = result.data.ProjectNarrativeSections;
            if (Array.isArray(apiSections) && apiSections.length > 0) {
              setSections(
                apiSections.map((section) => ({
                  name: section.item || "Untitled Section",
                  description:
                    section.description || "No description provided.",
                }))
              );
            }
          }
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
      }
    };

    fetchDraftData();
  }, [apiClient, selectedNofo, sessionId]);

  useEffect(() => {
    if (sections.length === 0) return;
    const viewed = readDraftCache<string[]>(sessionId, "sectionsViewed") || [];
    setUnviewedSections(sections.map((s) => s.name).filter((name) => !viewed.includes(name)));
  }, [sections, sessionId]);

  useEffect(() => {
    if (sections.length > 0) {
      const complete = sections.filter(
        (s) => (sectionAnswers[s.name] || "").trim().length > 0
      ).length;
      setCompletenessPassed(complete === sections.length);

      const allText = sections
        .map((s) => sectionAnswers[s.name] || "")
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
    if (!selectedNofo) return { draftData: null, grantName: null };
    const username = (await getCurrentUser()).username;
    const draftData = await apiClient.drafts.getDraft({ sessionId, userId: username });
    const nofoSummary = await apiClient.landingPage.getNOFOSummary(selectedNofo);
    const grantName = nofoSummary?.data?.GrantName || null;
    return { draftData, grantName };
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
    setExportingFormat(format);
    setExportError(null);
    setExportStatus(`Generating ${label}. This may take a moment.`);

    try {
      const { draftData, grantName } = await fetchDraftForExport();
      if (!draftData) throw new Error("No draft data available for export.");

      const payload = {
        title: draftData.title,
        grantName: grantName || undefined,
        projectBasics: draftData.projectBasics,
        sections: draftData.sections,
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
    ? "ra-compliance--passed"
    : "ra-compliance--incomplete";

  return (
    <div className="ra-container">
      {/* Application Summary Section */}
      <div className="ra-card">
        <div className="ra-header">
          <LuFileText className="ra-header__icon" aria-hidden="true" />
          <h2 className="ra-header__title">Application Summary</h2>
        </div>

        <div className="ra-stats-grid">
          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--words">
              {stats.wordCount}
            </div>
            <div className="ra-stat-card__label">Total Word Count</div>
            <div className="ra-stat-card__sublabel">Across all sections</div>
          </div>

          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--pages">
              {stats.pageCount}
            </div>
            <div className="ra-stat-card__label">Estimated Pages</div>
            <div className="ra-stat-card__sublabel">In PDF format</div>
          </div>

          <div className="ra-stat-card">
            <div className={`ra-stat-card__value ${completenessPassed ? "ra-stat-card__value--passed" : "ra-stat-card__value--incomplete"}`}>
              {stats.complete}/{sections.length}
            </div>
            <div className="ra-stat-card__label">Completion Status</div>
            <div className="ra-stat-card__sublabel">Sections complete</div>
          </div>
        </div>

        {/* Completeness Check Message */}
        <div className={`ra-compliance ${completenessClass}`}>
          {completenessPassed
            ? <LuCircleCheckBig className="ra-compliance__icon" aria-hidden="true" />
            : <LuTriangleAlert className="ra-compliance__icon" aria-hidden="true" />
          }
          <div>
            <h3 className="ra-compliance__title">
              {completenessPassed
                ? "All Sections Complete"
                : "Some Sections Incomplete"}
            </h3>
            <p className="ra-compliance__text">
              {completenessPassed
                ? "All required sections have been completed. Review your content for accuracy and alignment with NOFO requirements before exporting."
                : "Please complete all required sections before exporting your application."}
            </p>
          </div>
        </div>
      </div>

      {/* Before You Export Section */}
      <div className="ra-card">
        <h3 className="ra-export-section__title">Before You Export</h3>

        {unviewedSections.length > 0 && (
          <div className="ra-unviewed">
            <LuEye className="ra-unviewed__icon" aria-hidden="true" />
            <div className="ra-unviewed__body">
              <h4 className="ra-unviewed__title">
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
                className="ra-unviewed__action"
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
            aria-label="Make final edits - return to section editor"
          >
            <div className="ra-edit-btn__icon-wrapper">
              <LuSquarePen className="ra-edit-btn__icon" aria-hidden="true" />
            </div>
            <div className="ra-edit-btn__text">
              <div className="ra-edit-btn__title">Make Final Edits</div>
              <div className="ra-edit-btn__subtitle">
                Return to section editor
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
            What Happens After Export?
          </h3>
        </div>
        <ul className="ra-info-list">
          <li className="ra-info-list__item">
            You&apos;ll download a professionally formatted PDF of your
            application
          </li>
          <li className="ra-info-list__item">
            Submit the PDF through the official grants.gov portal
          </li>
          <li className="ra-info-list__item">
            Complete the SF-424 form separately (if required)
          </li>
        </ul>
      </div>

      {exportingFormat && (
        <p className="ra-export-progress">
          <span className="ra-export-progress__spinner" aria-hidden="true" />
          {`Generating ${EXPORT_LABELS[exportingFormat]}…`}
        </p>
      )}

      {exportError && (
        <div className="ra-export-error">
          <LuTriangleAlert className="ra-export-error__icon" aria-hidden="true" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Mounted before any export starts: a region that appears together with
          its first message is routinely missed by screen readers. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {exportStatus}
      </div>

      {/* Action Buttons */}
      <div className="ra-actions">
        <button
          onClick={() => onNavigate("sectionEditor")}
          className="ra-back-btn"
        >
          <LuArrowLeft className="ra-back-btn__icon" aria-hidden="true" />
          Back to Editing
        </button>

        {/* Export As dropdown */}
        <div className="ra-export-dropdown" ref={exportDropdownRef}>
          <button
            id="ra-export-trigger"
            onClick={() => setExportDropdownOpen((o) => !o)}
            disabled={!completenessPassed || exportingFormat !== null}
            className="ra-export-pdf-btn"
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
                Export As
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
