/**
 * Side drawer listing a draft's version history, with a diff preview and
 * restore for either the whole draft or the section being viewed.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Tag, X } from "lucide-react";
import { useApiClient } from "../../hooks/use-api-client";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import ConfirmationModal from "../common/ConfirmationModal";
import VersionDiff from "./VersionDiff";
import type { DraftVersionDetail, DraftVersionMeta } from "../../common/api-client/drafts-client";

/** A row's source is the write that replaced it, hence "Before ...". */
const SOURCE_LABELS: Record<string, string> = {
  autosave: "Before autosave",
  ai_generated: "Before AI generation",
  ai_regenerated: "Before AI rewrite",
  manual: "Before manual save",
  restore: "Before restore",
  status_change: "Before step change",
  manual_snapshot: "Saved version",
};

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  activeSectionName?: string;
  currentSections: Record<string, string>;
  onRestored: () => Promise<void> | void;
}

const wordCount = (text?: string) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  activeSectionName,
  currentSections,
  onRestored,
}) => {
  const apiClient = useApiClient();
  const containerRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose, lockScroll: false });

  const [versions, setVersions] = useState<DraftVersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selected, setSelected] = useState<DraftVersionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoreScope, setRestoreScope] = useState<"all" | "section" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const currentTotal = Object.values(currentSections || {}).reduce(
    (total, text) => total + wordCount(text),
    0
  );

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions(await apiClient.drafts.listVersions({ sessionId }));
    } catch (err) {
      console.error("Could not load version history:", err);
      setError("Version history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiClient, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setFocusedIndex(0);
    loadVersions();
  }, [isOpen, loadVersions]);

  const openVersion = async (version: DraftVersionMeta) => {
    if (version.oversize) return;
    setDetailLoading(true);
    try {
      const detail = await apiClient.drafts.getVersion({ sessionId, rev: version.rev });
      setSelected(detail);
      setLabelDraft(detail.label || "");
    } catch (err) {
      console.error("Could not load that version:", err);
      setError("That version could not be opened.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRowKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = event.key === "ArrowDown"
      ? Math.min(index + 1, versions.length - 1)
      : Math.max(index - 1, 0);
    setFocusedIndex(next);
    rowRefs.current[next]?.focus();
  };

  const handleRestore = async () => {
    if (!selected || !restoreScope) return;
    setRestoring(true);
    try {
      await apiClient.drafts.restoreVersion({
        sessionId,
        rev: selected.rev,
        sectionsOnly: restoreScope === "section" && activeSectionName ? [activeSectionName] : undefined,
      });
      await onRestored();
      await loadVersions();
      setSelected(null);
    } catch (err) {
      console.error("Restore failed:", err);
      setError("That version could not be restored.");
    } finally {
      setRestoring(false);
      setRestoreScope(null);
    }
  };

  const handleLabel = async () => {
    if (!selected) return;
    try {
      await apiClient.drafts.labelVersion({
        sessionId,
        rev: selected.rev,
        label: labelDraft.trim() || undefined,
      });
      setSelected({ ...selected, label: labelDraft.trim() || undefined });
      await loadVersions();
    } catch (err) {
      console.error("Could not label that version:", err);
      setError("The label could not be saved.");
    }
  };

  if (!isOpen) return null;

  const previousText = activeSectionName ? selected?.content?.sections?.[activeSectionName] ?? "" : "";
  const currentText = activeSectionName ? currentSections?.[activeSectionName] ?? "" : "";

  return (
    <>
      <div className="vh-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={containerRef}
        className="vh-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vh-title"
      >
        <div className="vh-header">
          <h2 id="vh-title" className="vh-title">Version history</h2>
          <button type="button" className="vh-close" onClick={onClose} aria-label="Close version history">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error && <p role="alert" className="vh-error">{error}</p>}

        {loading ? (
          <p className="vh-status" role="status">Loading versions...</p>
        ) : versions.length === 0 ? (
          <p className="vh-status">
            No earlier versions yet. One is kept automatically whenever your draft changes.
          </p>
        ) : (
          <ul className="vh-list" aria-label={`${versions.length} versions`}>
            {versions.map((version, index) => {
              const delta = (version.total_word_count ?? 0) - currentTotal;
              return (
                <li key={version.rev}>
                  <button
                    type="button"
                    ref={(el) => { rowRefs.current[index] = el; }}
                    tabIndex={index === focusedIndex ? 0 : -1}
                    onFocus={() => setFocusedIndex(index)}
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                    onClick={() => openVersion(version)}
                    disabled={version.oversize}
                    aria-current={selected?.rev === version.rev}
                    className={`vh-row${selected?.rev === version.rev ? " vh-row--active" : ""}`}
                  >
                    <span className="vh-row-time">
                      {DateTime.fromISO(version.created_at).toRelative() || version.created_at}
                    </span>
                    <span className="vh-badge">
                      {SOURCE_LABELS[version.source || ""] || "Earlier version"}
                    </span>
                    {version.label && (
                      <span className="vh-label">
                        <Tag size={12} aria-hidden="true" /> {version.label}
                      </span>
                    )}
                    <span className="vh-row-meta">
                      {(version.changed_sections || []).length > 0
                        ? `Changed: ${(version.changed_sections || []).join(", ")}`
                        : "Whole draft"}
                    </span>
                    <span className="vh-row-meta">
                      {version.oversize
                        ? "Too large to store — cannot be restored"
                        : delta === 0
                          ? "Same length as now"
                          : delta > 0
                            ? `${delta} words more than now`
                            : `${Math.abs(delta)} words fewer than now`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {detailLoading && <p className="vh-status" role="status">Loading that version...</p>}

        {selected && !detailLoading && (
          <div className="vh-detail">
            <h3 className="vh-detail-title">
              {DateTime.fromISO(selected.created_at).toLocaleString(DateTime.DATETIME_MED)}
            </h3>

            {activeSectionName ? (
              <VersionDiff previous={previousText} current={currentText} label={activeSectionName} />
            ) : (
              <p className="vh-status">Open a section to compare its text.</p>
            )}

            <div className="vh-label-row">
              <label htmlFor="vh-label-input">Label this version</label>
              <input
                id="vh-label-input"
                type="text"
                maxLength={120}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="e.g. Before budget rewrite"
              />
              <button type="button" className="vh-btn" onClick={handleLabel}>Save label</button>
            </div>

            <div className="vh-actions">
              {activeSectionName && (
                <button type="button" className="vh-btn vh-btn--primary" onClick={() => setRestoreScope("section")}>
                  Restore this section only
                </button>
              )}
              <button type="button" className="vh-btn" onClick={() => setRestoreScope("all")}>
                Restore whole draft
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={restoreScope !== null}
        onClose={() => setRestoreScope(null)}
        onConfirm={handleRestore}
        confirming={restoring}
        title={restoreScope === "section" ? "Restore this section" : "Restore whole draft"}
        confirmLabel="Restore"
        message={
          restoreScope === "section"
            ? `This replaces your current "${activeSectionName}" text with the version you are viewing. Other sections are left alone.`
            : "This replaces every section, plus your project basics and questionnaire answers, with the version you are viewing."
        }
        warning="Your current text is saved as a version first, so this can be undone."
      />
    </>
  );
};

export default VersionHistoryPanel;
