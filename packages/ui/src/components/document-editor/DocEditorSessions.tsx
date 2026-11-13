import React, { useState, useEffect, useContext, useId, useRef } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import PaginationControls from "../common/PaginationControls";
import { getCurrentUser } from "aws-amplify/auth";
import { LuArrowUpDown, LuArrowUp, LuArrowDown, LuPlus, LuTrash, LuRefreshCw, LuCalendar, LuCheck } from "react-icons/lu";
import { useNavigate } from "react-router";
import { Utils } from "../../common/utils";
import { DraftStatus } from "../../common/api-client/drafts-client";
import { DeleteConfirmationModal } from "../common/DeleteConfirmationModal";
import GrantPickerModal, { type PickedGrant } from "../common/GrantPickerModal";
import { addToRecentlyViewed } from "../../common/helpers/recently-viewed-nofos";
import { useStartDraft } from "../../hooks/use-start-draft";
import { useNotifications } from "../notifications/NotificationManager";
import TableScrollRegion from "../ui/TableScrollRegion";
import OutcomeDialog from "../outcomes/OutcomeDialog";
import type { ApplicationOutcome } from "../../common/api-client/outcomes-client";
import { OUTCOME_LABELS, formatDollars, type OutcomeInput } from "../../common/application-outcomes";
import "../../styles/dashboard.css";

export interface DocEditorSessionsProps {
  readonly toolsOpen: boolean;
  readonly documentIdentifier: string | null;
  onSessionSelect?: (sessionId: string) => void;
  showAllNOFOs?: boolean;
  onToggleShowAllNOFOs?: () => void;
  hasDocId?: boolean;
}

interface Session {
  draft_id: string;
  title: string;
  created_at: string;
  last_modified: string;
  document_identifier?: string;
  status?: DraftStatus;
}

// Grant folder names end in "/", and titles made from them inherit it.
const withoutTrailingSlash = (text: string) => text.replace(/\/+$/, "");

export default function DocEditorSessions(props: DocEditorSessionsProps) {
  const appContext = useContext(AppContext);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Session[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [listNotice, setListNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [showGrantPicker, setShowGrantPicker] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const startDraft = useStartDraft();
  const { addNotification } = useNotifications();
  const [sortField, setSortField] = useState<"title" | "last_modified">("last_modified");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [outcomes, setOutcomes] = useState<Record<string, ApplicationOutcome>>({});
  const [outcomeTarget, setOutcomeTarget] = useState<{ sessionId: string; title: string } | null>(null);
  const pageSizeSelectId = useId();
  const navigate = useNavigate();

  const { documentIdentifier, showAllNOFOs, onToggleShowAllNOFOs, hasDocId } = props;

  const getSessions = async () => {
    if (!appContext) return;

    try {
      const apiClient = new ApiClient(appContext);
      const username = (await getCurrentUser()).username;

      if (username) {
        // Get drafts filtered by documentIdentifier (null means all drafts)
        const [result, recorded] = await Promise.all([
          apiClient.drafts.getDrafts(username, documentIdentifier),
          apiClient.outcomes.list().catch((e): ApplicationOutcome[] => {
            console.error("Error fetching application outcomes:", e);
            return [];
          }),
        ]);
        setOutcomes(Object.fromEntries(recorded.map((o) => [o.sessionId, o])));
        setSessions(result.map(draft => ({
          draft_id: draft.sessionId,
          title: withoutTrailingSlash(draft.title),
          created_at: draft.lastModified,
          last_modified: draft.lastModified,
          document_identifier: draft.documentIdentifier,
          status: draft.status || 'project_basics'
        })));
      }
    } catch (e) {
      console.error("Error fetching sessions:", e);
      setSessions([]);
    }
  };

  useEffect(() => {
    if (!appContext) return;

    const loadSessions = async () => {
      setListNotice("");
      setIsLoading(true);
      await getSessions();
      setIsLoading(false);
    };

    loadSessions();
  }, [appContext, props.toolsOpen, documentIdentifier]);

  const handleSelectItem = (item: Session, event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedItems([...selectedItems, item]);
    } else {
      setSelectedItems(selectedItems.filter((i) => i.draft_id !== item.draft_id));
    }
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedItems(sessions);
    } else {
      setSelectedItems([]);
    }
  };

  const deleteSelectedSessions = async () => {
    if (!appContext) return;

    try {
      setListNotice("");
      setIsLoading(true);
      const apiClient = new ApiClient(appContext);
      const username = (await getCurrentUser()).username;

      if (!username) {
        throw new Error("User not authenticated");
      }

      await Promise.all(
        selectedItems.map(session =>
          apiClient.drafts.deleteDraft(session.draft_id, username)
        )
      );

      setSelectedItems([]);
      setShowModalDelete(false);
      // The dialog would hand focus back to Delete, which is now disabled.
      headingRef.current?.focus();
      addNotification(
        "success",
        selectedItems.length === 1 ? "Application deleted." : `${selectedItems.length} applications deleted.`
      );
      await getSessions();
    } catch (e) {
      console.error("Error deleting sessions:", e);
      setShowModalDelete(false);
      addNotification("error", "The applications could not be deleted. Please try again.");
      await getSessions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: "title" | "last_modified") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const direction = sortDirection === "asc" ? 1 : -1;

    if (sortField === "last_modified") {
      return (
        (new Date(aValue).getTime() - new Date(bValue).getTime()) * direction
      );
    }

    return aValue.localeCompare(bValue) * direction;
  });

  const paginatedItems = sortedSessions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const getSortIcon = (field: "title" | "last_modified") => {
    if (sortField !== field) return <LuArrowUpDown size={14} aria-hidden="true" />;
    return sortDirection === "asc" ? <LuArrowUp size={14} aria-hidden="true" /> : <LuArrowDown size={14} aria-hidden="true" />;
  };

  const formatSessionTime = (timestamp: string) => {
    return Utils.formatTimestamp(timestamp);
  };

  // Titles repeat ("Application for <grant>"), so row control names carry the date.
  const rowName = (item: Session) => `${item.title}, last modified ${formatSessionTime(item.last_modified)}`;

  const getStatusLabel = (status?: DraftStatus): string => {
    switch (status) {
      case 'project_basics':
        return 'Project basics';
      case 'questionnaire':
        return 'Questionnaire';
      case 'uploading_documents':
        return 'Additional information';
      case 'generating_draft':
        return 'Generating draft';
      case 'editing_sections':
        return 'Section editor';
      case 'reviewing':
        return 'Review';
      case 'submitted':
        return 'Submitted';
      default:
        return 'Project basics';
    }
  };

  const getStatusColor = (status?: DraftStatus): string => {
    switch (status) {
      case 'project_basics':
        return 'var(--gw-color-border-input-hover)';
      case 'questionnaire':
        return 'var(--gw-color-primary-hover)';
      case 'uploading_documents':
        return 'var(--gw-color-info)';
      case 'generating_draft':
        return 'var(--gw-color-warning-text)';
      case 'editing_sections':
        return 'var(--gw-color-success)';
      case 'reviewing':
        return 'var(--gw-color-warning-text)';
      case 'submitted':
        return 'var(--gw-color-category-3)';
      default:
        return 'var(--gw-color-border-input-hover)';
    }
  };

  const outcomeText = (o?: ApplicationOutcome): string => {
    if (!o) return "Not recorded";
    return o.status === "awarded" && o.amountAwarded !== null
      ? `${OUTCOME_LABELS.awarded} · ${formatDollars(o.amountAwarded)}`
      : OUTCOME_LABELS[o.status];
  };

  const saveOutcome = async (sessionId: string, input: OutcomeInput) => {
    if (!appContext) return;
    const saved = await new ApiClient(appContext).outcomes.record(sessionId, input);
    setOutcomes((prev) => ({ ...prev, [sessionId]: saved }));
    addNotification("success", "Outcome saved.");
  };

  const statusBadgeStyle = (status?: DraftStatus): React.CSSProperties => {
    const color = getStatusColor(status);
    return {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: 'var(--gw-radius-container)',
      fontSize: '12px',
      fontWeight: '500',
      // color-mix, not a hex alpha suffix: some colors are var() tokens.
      backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
      color: color,
      border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
      // Ensure sufficient contrast for text
      minWidth: '100px',
      textAlign: 'center' as const,
    };
  };

  const handleGrantPicked = async (grant: PickedGrant) => {
    setStartingDraft(true);
    try {
      const url = await startDraft(grant.value);
      addToRecentlyViewed(grant);
      setShowGrantPicker(false);
      navigate(url);
    } catch (err) {
      console.error("Failed to start new application:", err);
      addNotification("error", "Failed to start a new application. Please try again.");
    } finally {
      setStartingDraft(false);
    }
  };

  return (
    <div className="dashboard-content">
      <GrantPickerModal
        isOpen={showGrantPicker}
        onClose={() => setShowGrantPicker(false)}
        onSelect={handleGrantPicked}
        title="Start a new application"
        description="Choose the grant you want to apply for."
        busy={startingDraft}
      />
      <OutcomeDialog
        application={outcomeTarget}
        current={outcomeTarget ? outcomes[outcomeTarget.sessionId] : undefined}
        onSave={saveOutcome}
        onClose={() => setOutcomeTarget(null)}
      />
      <DeleteConfirmationModal
        isOpen={showModalDelete}
        onClose={() => setShowModalDelete(false)}
        onConfirm={deleteSelectedSessions}
        title={`Delete application${selectedItems.length > 1 ? "s" : ""}`}
        itemName={selectedItems.length === 1 ? selectedItems[0].title : undefined}
        itemCount={selectedItems.length > 1 ? selectedItems.length : undefined}
        itemLabel="application"
      />

      {/* Header section */}
      <div className="dashboard-header dashboard-header--wrap">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>My applications</h1>
          <p className="dashboard-header__description">
            Manage and continue your saved grant applications
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="gw-btn gw-btn--primary action-button add-button"
            onClick={() => {
              if (props.documentIdentifier) {
                navigate(`/document-editor?grant=${encodeURIComponent(props.documentIdentifier)}`);
              } else {
                setShowGrantPicker(true);
              }
            }}
            aria-label="Create new application"
          >
            <LuPlus size={16} className="button-icon" aria-hidden="true" />
            <span>New application</span>
          </button>
          {hasDocId && onToggleShowAllNOFOs && (
            <button
              className="gw-btn gw-btn--secondary action-button invite-button"
              onClick={onToggleShowAllNOFOs}
              aria-label="Show all grants — include applications for other grants"
              aria-pressed={showAllNOFOs}
            >
              {showAllNOFOs && <LuCheck size={16} className="button-icon" aria-hidden="true" />}
              <span>Show all grants</span>
            </button>
          )}
          <button
            className="gw-btn gw-btn--danger action-button danger-button"
            onClick={() => selectedItems.length > 0 && setShowModalDelete(true)}
            aria-disabled={selectedItems.length === 0 || undefined}
            aria-label={selectedItems.length === 0 ? "Delete applications (no applications selected)" : `Delete ${selectedItems.length} selected application${selectedItems.length > 1 ? 's' : ''}`}
          >
            <LuTrash size={16} className="button-icon" aria-hidden="true" />
            <span>Delete</span>
          </button>
          <button
            className="gw-btn gw-btn--secondary action-button refresh-button"
            onClick={async () => {
              if (isLoading) return;
              setListNotice("");
              setIsLoading(true);
              await getSessions();
              setIsLoading(false);
              setListNotice("Applications updated");
            }}
            // aria-disabled, not disabled: disabling the focused button would drop focus to the page.
            aria-disabled={isLoading}
            aria-label={isLoading ? "Refreshing applications list" : "Refresh applications list"}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <span className="refresh-loading">Refreshing...</span>
            ) : (
              <>
                <LuRefreshCw size={16} className="button-icon refresh-icon" aria-hidden="true" />
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Table section */}
      <TableScrollRegion label="Applications table" minWidth={880}>
      <div className="table-container" role="table" aria-label="Applications">
        <div className="table-header" role="rowgroup" style={{ gridTemplateColumns: "104px 2fr 1.3fr 1.5fr 1fr 1.4fr" }}>
          <div role="row" style={{ display: "contents" }}>
            <div className="header-cell" role="cell">
              <label className="gw-select-all">
                <input
                  type="checkbox"
                  checked={selectedItems.length === sessions.length && sessions.length > 0}
                  onChange={handleSelectAll}
                  aria-label="Select all applications"
                  style={{ cursor: "pointer" }}
                  disabled={isLoading || sessions.length === 0}
                />
                <span aria-hidden="true">Select all</span>
              </label>
            </div>
            <div
              className="header-cell"
              role="columnheader"
              aria-sort={sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                className="gw-sort-button"
                onClick={() => !isLoading && handleSort("title")}
                disabled={isLoading}
              >
                Title {!isLoading && getSortIcon("title")}
              </button>
            </div>
            <div
              className="header-cell"
              role="columnheader"
              aria-sort={sortField === "last_modified" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                type="button"
                className="gw-sort-button"
                onClick={() => !isLoading && handleSort("last_modified")}
                disabled={isLoading}
              >
                Last modified {!isLoading && getSortIcon("last_modified")}
              </button>
            </div>
            <div className="header-cell" role="columnheader">Grant</div>
            <div className="header-cell" role="columnheader" style={{ textAlign: 'center' }}>Status</div>
            <div className="header-cell" role="columnheader">Outcome</div>
          </div>
        </div>
        <div className="table-body" role={isLoading || paginatedItems.length === 0 ? undefined : "rowgroup"}>
          {isLoading ? (
            // Visual only — role="table" cannot own a live region, so the
            // announcement lives in the status region below the table.
            <div className="table-loading" aria-hidden="true">
              <div className="table-loading-spinner"></div>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="no-data">
              <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>
                No applications
              </div>
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div key={item.draft_id} className="table-row" role="row" style={{ gridTemplateColumns: "104px 2fr 1.3fr 1.5fr 1fr 1.4fr" }}>
                <div className="row-cell" role="cell">
                  <input
                    type="checkbox"
                    checked={selectedItems.some(
                      (i) => i.draft_id === item.draft_id
                    )}
                    onChange={(e) => handleSelectItem(item, e)}
                    aria-label={`Select application: ${rowName(item)}`}
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div className="row-cell" role="cell">
                  <button
                    onClick={() => {
                      if (props.onSessionSelect) {
                        props.onSessionSelect(item.draft_id);
                      }
                    }}
                    aria-label={`Open application: ${rowName(item)}`}
                    style={{
                      color: "var(--gw-color-primary-hover)",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "14px",
                      textDecoration: "underline",
                    }}
                  >
                    {item.title}
                  </button>
                </div>
                <div className="row-cell" role="cell">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--gw-color-text-secondary)" }}>
                    <LuCalendar size={16} aria-hidden="true" />
                    <time dateTime={item.last_modified}>
                      {formatSessionTime(item.last_modified)}
                    </time>
                  </div>
                </div>
                <div className="row-cell" role="cell">
                  {withoutTrailingSlash(item.document_identifier || '') || (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="visually-hidden">Not specified</span>
                    </>
                  )}
                </div>
                <div className="row-cell" role="cell" style={{ justifyContent: 'center' }}>
                  <span style={statusBadgeStyle(item.status)}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>
                <div className="row-cell" role="cell">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
                    <span style={{ color: outcomes[item.draft_id] ? "inherit" : "var(--gw-color-text-secondary, #5a5a5a)" }}>
                      {outcomeText(outcomes[item.draft_id])}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOutcomeTarget({ sessionId: item.draft_id, title: item.title })}
                      aria-label={`Update outcome for ${rowName(item)}`}
                      style={{
                        color: "var(--gw-color-primary-hover)",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontSize: "13px",
                        textDecoration: "underline",
                      }}
                    >
                      Update outcome
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </TableScrollRegion>

      <div role="status" aria-live="polite" className="visually-hidden">
        {isLoading ? "Loading applications" : listNotice}
      </div>

      {/* Pagination */}
      {!isLoading && sortedSessions.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={Math.ceil(sortedSessions.length / pageSize)}
          totalItems={sortedSessions.length}
          itemsPerPage={pageSize}
          itemsPerPageOptions={[10, 20, 50]}
          itemLabel="applications"
          selectId={pageSizeSelectId}
          live
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
} 