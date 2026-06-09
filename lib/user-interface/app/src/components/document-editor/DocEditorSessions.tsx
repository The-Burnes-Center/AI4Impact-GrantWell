import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { LuArrowUpDown, LuArrowUp, LuArrowDown, LuPlus, LuTrash, LuRefreshCw, LuCalendar } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { Utils } from "../../common/utils";
import { DraftStatus } from "../../common/api-client/drafts-client";
import { DeleteConfirmationModal } from "../common/DeleteConfirmationModal";
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

export default function DocEditorSessions(props: DocEditorSessionsProps) {
  const appContext = useContext(AppContext);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Session[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [sortField, setSortField] = useState<"title" | "last_modified">("last_modified");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const navigate = useNavigate();

  const { documentIdentifier, showAllNOFOs, onToggleShowAllNOFOs, hasDocId } = props;

  const getSessions = async () => {
    if (!appContext) return;

    try {
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      if (username) {
        // Get drafts filtered by documentIdentifier (null means all drafts)
        const result = await apiClient.drafts.getDrafts(username, documentIdentifier);
        setSessions(result.map(draft => ({
          draft_id: draft.sessionId,
          title: draft.title,
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
      setIsLoading(true);
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

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
      await getSessions();
    } catch (e) {
      console.error("Error deleting sessions:", e);
      // You might want to show an error notification here
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
    if (sortField !== field) return <LuArrowUpDown size={14} />;
    return sortDirection === "asc" ? <LuArrowUp size={14} /> : <LuArrowDown size={14} />;
  };

  const formatSessionTime = (timestamp: string) => {
    return Utils.formatTimestamp(timestamp);
  };

  const getStatusLabel = (status?: DraftStatus): string => {
    switch (status) {
      case 'project_basics':
        return 'Project Basics';
      case 'questionnaire':
        return 'Questionnaire';
      case 'uploading_documents':
        return 'Uploading Documents';
      case 'generating_draft':
        return 'Generating Draft';
      case 'editing_sections':
        return 'Editing Sections';
      case 'reviewing':
        return 'Reviewing';
      case 'submitted':
        return 'Submitted';
      default:
        return 'Project Basics';
    }
  };

  const getStatusColor = (status?: DraftStatus): string => {
    switch (status) {
      case 'project_basics':
        return '#4b5563';
      case 'questionnaire':
        return '#195C53';
      case 'uploading_documents':
        return '#0e7490';
      case 'generating_draft':
        return '#7c2d12';
      case 'editing_sections':
        return '#047857';
      case 'reviewing':
        return '#b45309';
      case 'submitted':
        return '#6d28d9';
      default:
        return '#4b5563';
    }
  };

  const statusBadgeStyle = (status?: DraftStatus): React.CSSProperties => {
    const color = getStatusColor(status);
    return {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '500',
      backgroundColor: color + '15', // 15% opacity background
      color: color,
      border: `1px solid ${color}30`, // 30% opacity border
      // Ensure sufficient contrast for text
      minWidth: '100px',
      textAlign: 'center' as const,
    };
  };

  return (
    <div className="dashboard-content">
      <DeleteConfirmationModal
        isOpen={showModalDelete}
        onClose={() => setShowModalDelete(false)}
        onConfirm={deleteSelectedSessions}
        title={`Delete draft${selectedItems.length > 1 ? "s" : ""}`}
        itemName={selectedItems.length === 1 ? selectedItems[0].draft_id : undefined}
        itemCount={selectedItems.length > 1 ? selectedItems.length : undefined}
        itemLabel="draft"
      />

      {/* Header section */}
      <div className="dashboard-header">
        <div>
          <h1>Drafts</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            Manage and access your saved grant application drafts
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="action-button add-button"
            onClick={() => {
              // If documentIdentifier is available, pass it as NOFO parameter
              if (props.documentIdentifier) {
                navigate(`/document-editor?nofo=${encodeURIComponent(props.documentIdentifier)}`);
              } else {
                navigate(`/document-editor`);
              }
            }}
            aria-label="Create new draft"
          >
            <LuPlus size={16} className="button-icon" />
            <span>New Draft</span>
          </button>
          {hasDocId && onToggleShowAllNOFOs && (
            <button
              className="action-button invite-button"
              onClick={onToggleShowAllNOFOs}
              aria-label={showAllNOFOs ? "Show only current NOFO drafts" : "Show all NOFO drafts"}
            >
              {showAllNOFOs ? "Show Current NOFO Only" : "Show All NOFOs"}
            </button>
          )}
          <button
            className="action-button danger-button"
            onClick={() => setShowModalDelete(true)}
            disabled={selectedItems.length === 0}
            style={{
              backgroundColor: selectedItems.length === 0 ? "#e5e7eb" : "#e74c3c",
              color: selectedItems.length === 0 ? "#9ca3af" : "white",
              cursor: selectedItems.length === 0 ? "not-allowed" : "pointer",
            }}
            aria-label={selectedItems.length === 0 ? "Delete drafts (no drafts selected)" : `Delete ${selectedItems.length} selected draft${selectedItems.length > 1 ? 's' : ''}`}
            aria-disabled={selectedItems.length === 0}
          >
            <LuTrash size={16} className="button-icon" />
            <span>Delete</span>
          </button>
          <button
            className="action-button refresh-button"
            onClick={async () => {
              setIsLoading(true);
              await getSessions();
              setIsLoading(false);
            }}
            disabled={isLoading}
            aria-label="Refresh drafts list"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <span className="refresh-loading">Refreshing...</span>
            ) : (
              <>
                <LuRefreshCw size={16} className="button-icon refresh-icon" />
                <span>Refresh</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Table section */}
      <div className="table-container" role="table" aria-label="Drafts">
        <div className="table-header" role="rowgroup" style={{ gridTemplateColumns: "48px 2fr 1.5fr 1.5fr 1fr" }}>
          <div role="row" style={{ display: "contents" }}>
            <div className="header-cell" role="columnheader">
              <input
                type="checkbox"
                checked={selectedItems.length === sessions.length && sessions.length > 0}
                onChange={handleSelectAll}
                aria-label="Select all drafts"
                style={{ cursor: "pointer" }}
                disabled={isLoading || sessions.length === 0}
              />
            </div>
            <div
              className="header-cell"
              role="columnheader"
              aria-sort={sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
            >
              <button
                onClick={() => !isLoading && handleSort("title")}
                disabled={isLoading}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: isLoading ? "default" : "pointer", padding: 0, font: "inherit", color: "inherit" }}
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
                onClick={() => !isLoading && handleSort("last_modified")}
                disabled={isLoading}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: isLoading ? "default" : "pointer", padding: 0, font: "inherit", color: "inherit" }}
              >
                Last Modified {!isLoading && getSortIcon("last_modified")}
              </button>
            </div>
            <div className="header-cell" role="columnheader">NOFO</div>
            <div className="header-cell" role="columnheader" style={{ textAlign: 'center' }}>Status</div>
          </div>
        </div>
        <div className="table-body" role={isLoading || paginatedItems.length === 0 ? undefined : "rowgroup"}>
          {isLoading ? (
            <div className="table-loading">
              <div className="table-loading-spinner"></div>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="no-data">
              <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>
                No drafts
              </div>
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div key={item.draft_id} className="table-row" role="row" style={{ gridTemplateColumns: "48px 2fr 1.5fr 1.5fr 1fr" }}>
                <div className="row-cell" role="cell">
                  <input
                    type="checkbox"
                    checked={selectedItems.some(
                      (i) => i.draft_id === item.draft_id
                    )}
                    onChange={(e) => handleSelectItem(item, e)}
                    aria-label={`Select draft: ${item.title}`}
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
                    aria-label={`Open draft: ${item.title}`}
                    style={{
                      color: "#195C53",
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
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#5a5a5a" }}>
                    <LuCalendar size={16} aria-hidden="true" />
                    <time dateTime={item.last_modified}>
                      {formatSessionTime(item.last_modified)}
                    </time>
                  </div>
                </div>
                <div className="row-cell" role="cell">
                  <span aria-label={`NOFO: ${item.document_identifier || 'Not specified'}`}>
                    {item.document_identifier || '—'}
                  </span>
                </div>
                <div className="row-cell" role="cell" style={{ justifyContent: 'center' }}>
                  <span
                    aria-label={`Draft status: ${getStatusLabel(item.status)}`}
                    style={statusBadgeStyle(item.status)}
                  >
                    {getStatusLabel(item.status)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && sortedSessions.length > 0 && (
        <div className="pagination-container">
          <div className="pagination-info">
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedSessions.length)} of{" "}
            {sortedSessions.length} drafts
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div className="pagination-controls">
              <button
                className={`pagination-button ${currentPage === 1 ? "disabled" : ""}`}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                First
              </button>
              <button
                className={`pagination-button ${currentPage === 1 ? "disabled" : ""}`}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                className={`pagination-button ${currentPage === Math.ceil(sortedSessions.length / pageSize) ? "disabled" : ""}`}
                disabled={currentPage === Math.ceil(sortedSessions.length / pageSize)}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
              <button
                className={`pagination-button ${currentPage === Math.ceil(sortedSessions.length / pageSize) ? "disabled" : ""}`}
                disabled={currentPage === Math.ceil(sortedSessions.length / pageSize)}
                onClick={() => setCurrentPage(Math.ceil(sortedSessions.length / pageSize))}
              >
                Last
              </button>
            </div>
            <div className="items-per-page">
              <label htmlFor="items-per-page-select" style={{ marginRight: "8px" }}>
                Show:
              </label>
              <select
                id="items-per-page-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                aria-label="Items per page"
                className="form-input"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 