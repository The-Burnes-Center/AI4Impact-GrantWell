/**
 * Side drawer listing a draft's version history, with a diff preview and
 * restore for either the whole draft or a single section.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { LuTag, LuX } from "react-icons/lu";
import { useApiClient } from "../../hooks/use-api-client";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import ConfirmationModal from "../common/ConfirmationModal";
import VersionDiff from "./VersionDiff";
import type { DraftVersionDetail, DraftVersionMeta } from "../../common/api-client/drafts-client";

/** A row's source is the write that produced its content. */
const SOURCE_LABELS: Record<string, string> = {
  initial: "Blank draft",
  autosave: "Your edit",
  manual: "Your edit",
  ai_generated: "AI generated",
  ai_regenerated: "AI rewrite",
  restore: "Restored version",
  status_change: "Step change",
  manual_snapshot: "Saved version",
};

const EMPTY_CHANGE_NOTES: Record<string, string> = {
  initial: "Start of the draft — no section text yet",
  manual_snapshot: "Snapshot of the whole draft",
  status_change: "Step change only — no section text changed",
  autosave: "Project details only — no section text changed",
  manual: "Project details only — no section text changed",
  restore: "Restored — no section text changed",
  ai_generated: "No section text changed",
  ai_regenerated: "No section text changed",
};

const LABEL_VARIANTS: Record<string, "current" | "user" | "ai"> = {
  "Current draft": "current",
  "Your edit": "user",
  "Saved version": "user",
  "AI generated": "ai",
  "AI rewrite": "ai",
};

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  activeSectionName?: string;
  currentSections: Record<string, string>;
  /** Marks the row that is already the live draft, which cannot be restored onto itself. */
  currentRev?: number;
  onRestored: () => Promise<void> | void;
}

const badgeVariant = (label: string) => LABEL_VARIANTS[label] || "system";

const emptyChangeNote = (source?: string) =>
  EMPTY_CHANGE_NOTES[source || ""] || "No section text changed";

const wordCount = (text?: string) => (text ? text.trim().split(/\s+/).filter(Boolean).length : 0);

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  activeSectionName,
  currentSections,
  currentRev,
  onRestored,
}) => {
  const apiClient = useApiClient();
  const containerRef = useFocusTrap<HTMLDivElement>({ isOpen, onEscape: onClose, lockScroll: false });

  const [versions, setVersions] = useState<DraftVersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selected, setSelected] = useState<DraftVersionDetail | null>(null);
  const [scopeSection, setScopeSection] = useState<string | null>(null);
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
    setScopeSection(null);
    setFocusedIndex(0);
    loadVersions();
  }, [isOpen, loadVersions]);

  const defaultScope = (detail: DraftVersionDetail): string | null => {
    const sections = detail.content?.sections ?? {};
    const changed = (detail.changed_sections || []).filter((name) => sections[name]);
    if (changed.length === 1) return changed[0];
    if (activeSectionName && sections[activeSectionName]) return activeSectionName;
    return changed[0] ?? Object.keys(sections).find((name) => sections[name]) ?? null;
  };

  const openVersion = async (version: DraftVersionMeta) => {
    if (version.oversize) return;
    setDetailLoading(true);
    try {
      const detail = await apiClient.drafts.getVersion({ sessionId, rev: version.rev });
      setSelected(detail);
      setScopeSection(defaultScope(detail));
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
        sectionsOnly: restoreScope === "section" && scopeSection ? [scopeSection] : undefined,
      });
      await onRestored();
      await loadVersions();
      setSelected(null);
    } catch (err) {
      console.error("Restore failed:", err);
      // The server explains refusals precisely (empty version, missing section);
      // a generic message here would hide the reason.
      setError(err instanceof Error ? err.message : "That version could not be restored.");
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

  const previousText = scopeSection ? selected?.content?.sections?.[scopeSection] ?? "" : "";
  const currentText = scopeSection ? currentSections?.[scopeSection] ?? "" : "";

  const snapshotSections = selected?.content?.sections ?? {};
  const versionHasText = Object.values(snapshotSections).some(Boolean);
  const draftHasText = Object.values(currentSections || {}).some(Boolean);
  const restorableSections = Object.keys(snapshotSections)
    .filter((name) => snapshotSections[name])
    .sort();
  const canRestoreSection = Boolean(scopeSection && snapshotSections[scopeSection]);
  // Blocked rather than merely warned about: this snapshot predates the draft's text.
  const wouldEraseDraft = draftHasText && !versionHasText;
  const isCurrent = selected != null && selected.rev === currentRev;

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
            <LuX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="vh-body">
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
                const badgeLabel =
                  version.rev === currentRev
                    ? "Current draft"
                    : SOURCE_LABELS[version.source || ""] || "Earlier version";
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
                      <span className={`vh-badge vh-badge--${badgeVariant(badgeLabel)}`}>
                        {badgeLabel}
                      </span>
                      {version.label && (
                        <span className="vh-label">
                          <LuTag size={12} aria-hidden="true" /> {version.label}
                        </span>
                      )}
                      <span className="vh-row-meta">
                        {(version.changed_sections || []).length > 0
                          ? `Changed: ${(version.changed_sections || []).join(", ")}`
                          : emptyChangeNote(version.source)}
                      </span>
                      <span className="vh-row-meta">
                        {version.oversize
                          ? "Too large to store — cannot be restored"
                          : (version.total_word_count ?? 0) === 0
                            ? "No narrative text in this version"
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

              {restorableSections.length > 1 && (
                <div className="vh-scope-row">
                  <label htmlFor="vh-scope-select">Section to compare and restore</label>
                  <select
                    id="vh-scope-select"
                    value={scopeSection ?? ""}
                    onChange={(e) => setScopeSection(e.target.value || null)}
                  >
                    {restorableSections.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {scopeSection ? (
                <VersionDiff previous={previousText} current={currentText} label={scopeSection} />
              ) : (
                <p className="vh-status">This version has no saved section text to compare.</p>
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

              {isCurrent && (
                <p className="vh-status">This is your draft as it stands now, so there is nothing to restore.</p>
              )}
            </div>
          )}
        </div>

        {selected && !detailLoading && !isCurrent && (
          <div className="vh-footer">
            {!versionHasText && (
              <p className="vh-status">
                This version was saved before any narrative text existed.
                {draftHasText ? " Restoring it would erase your sections, so it is disabled." : ""}
              </p>
            )}
            {versionHasText && scopeSection && !canRestoreSection && (
              <p className="vh-status">
                This version has no saved text for &quot;{scopeSection}&quot;. You can still
                restore the sections it does contain.
              </p>
            )}
            {canRestoreSection && (
              <p className="vh-status">Section in scope: &quot;{scopeSection}&quot;</p>
            )}

            <div className="vh-actions">
              {scopeSection && (
                <button
                  type="button"
                  className="vh-btn vh-btn--primary"
                  onClick={() => setRestoreScope("section")}
                  disabled={!canRestoreSection}
                >
                  Restore this section only
                </button>
              )}
              <button
                type="button"
                className="vh-btn"
                onClick={() => setRestoreScope("all")}
                disabled={wouldEraseDraft}
              >
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
            ? `This replaces your current "${scopeSection}" text with the version you are viewing. Other sections are left alone.`
            : "This replaces every section, plus your project basics and questionnaire answers, with the version you are viewing."
        }
        warning="Your current text is already kept as a version, so this can be undone."
      />
    </>
  );
};

export default VersionHistoryPanel;
