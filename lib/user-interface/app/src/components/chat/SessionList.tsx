import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { DateTime } from "luxon";
import { useNavigate } from "react-router";
import { LuArrowUpDown, LuArrowUp, LuArrowDown, LuPlus, LuTrash, LuRefreshCw, LuCalendar } from "react-icons/lu";
import { DeleteConfirmationModal } from "../common/DeleteConfirmationModal";
import "../../styles/dashboard.css";

// Styles for the sessions component
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    padding: "20px",
    borderBottom: "1px solid #e5e7eb",
  },
  headerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: "600",
    margin: 0,
  },
  headerDescription: {
    fontSize: "14px",
    color: "#5a6169",
    marginTop: "4px",
  },
  buttonContainer: {
    display: "flex",
    gap: "12px",
  },
  button: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "500",
  },
  primaryButton: {
    backgroundColor: "#1a73e8",
    color: "white",
  },
  dangerButton: {
    backgroundColor: "#d32f2f",
    color: "white",
  },
  disabledButton: {
    backgroundColor: "#e5e7eb",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
  tableContainer: {
    flex: 1,
    overflowX: "auto" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  tableHeader: {
    backgroundColor: "#f9fafb",
    padding: "12px 16px",
    textAlign: "left" as const,
    fontWeight: "600",
    color: "#4b5563",
    borderBottom: "1px solid #e5e7eb",
    cursor: "pointer",
    userSelect: "none" as const,
    fontSize: "14px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  tableHeaderContent: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  tableCell: {
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  checkboxCell: {
    width: "48px",
    textAlign: "center" as const,
  },
  checkbox: {
    cursor: "pointer",
  },
  link: {
    color: "#1a73e8",
    textDecoration: "none",
  },
  dateCell: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#5a6169",
    fontSize: "14px",
  },
  calendarIcon: {
    color: "#6e747f",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    color: "#5a6169",
    textAlign: "center" as const,
  },
  emptyStateTitle: {
    fontSize: "18px",
    fontWeight: "500",
    marginBottom: "8px",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "200px",
  },
  spinner: {
    border: "4px solid rgba(0, 0, 0, 0.1)",
    borderLeftColor: "#1a73e8",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    animation: "spin 1s linear infinite",
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderTop: "1px solid #e5e7eb",
  },
  pageInfo: {
    fontSize: "14px",
    color: "#5a6169",
  },
  pageSizeSelect: {
    padding: "4px 8px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    marginLeft: "8px",
    fontSize: "14px",
  },
  paginationButtons: {
    display: "flex",
    gap: "8px",
  },
  paginationButton: {
    padding: "6px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    backgroundColor: "white",
    fontSize: "14px",
    cursor: "pointer",
  },
  paginationButtonDisabled: {
    backgroundColor: "#f3f4f6",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
};

export interface SessionsProps {
  readonly toolsOpen: boolean;
  readonly documentIdentifier: string | null;
  onSessionSelect?: (sessionId: string) => void;
}

type Session = import("../../common/api-client/sessions-client").SessionListItem;

export default function Sessions(props: SessionsProps) {
  const appContext = useContext(AppContext);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Session[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [sortField, setSortField] = useState<"title" | "time_stamp">(
    "time_stamp"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const navigate = useNavigate();

  const { documentIdentifier } = props;

  const getSessions = useCallback(async () => {
    if (!appContext) return;

    try {
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      if (username) {
        const result = await apiClient.sessions.getSessions(
          username,
          documentIdentifier,
          true
        );
        setSessions(result);
      }
    } catch (e) {
      console.error("Error fetching sessions:", e);
      setSessions([]);
    }
  }, [appContext, documentIdentifier]);

  useEffect(() => {
    if (!appContext) return;

    const loadSessions = async () => {
      setIsLoading(true);
      await getSessions();
      setIsLoading(false);
    };

    loadSessions();
  }, [appContext, getSessions, props.toolsOpen, documentIdentifier]);


  const deleteSelectedSessions = async () => {
    if (!appContext || selectedItems.length === 0) return;

    try {
      setIsLoading(true);
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      await Promise.all(
        selectedItems.map((session) =>
          apiClient.sessions.deleteSession(session.session_id, username)
        )
      );

      setSelectedItems([]);
      setShowModalDelete(false);
      await getSessions();
    } catch (e) {
      console.error("Error deleting sessions:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedItems(e.target.checked ? paginatedItems : []);
  };

  const handleSelectItem = (
    item: Session,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.checked) {
      setSelectedItems((prev) => [...prev, item]);
    } else {
      setSelectedItems((prev) =>
        prev.filter((i) => i.session_id !== item.session_id)
      );
    }
  };

  const handleSort = (field: "title" | "time_stamp") => {
    setSortDirection((prev) =>
      sortField === field ? (prev === "asc" ? "desc" : "asc") : "asc"
    );
    setSortField(field);
  };

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const sortMultiplier = sortDirection === "asc" ? 1 : -1;

      if (sortField === "title") {
        return sortMultiplier * a.title.localeCompare(b.title);
      } else {
        return (
          sortMultiplier *
          (new Date(a.time_stamp).getTime() - new Date(b.time_stamp).getTime())
        );
      }
    });
  }, [sessions, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedSessions.length / pageSize);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedSessions.slice(startIndex, startIndex + pageSize);
  }, [sortedSessions, currentPage, pageSize]);

  const getSortIcon = (field: "title" | "time_stamp") => {
    if (sortField !== field) return <LuArrowUpDown size={14} />;
    return sortDirection === "asc" ? <LuArrowUp size={14} /> : <LuArrowDown size={14} />;
  };

  const formatSessionTime = (timestamp: string) => {
    return DateTime.fromISO(new Date(timestamp).toISOString()).toLocaleString(
      DateTime.DATETIME_SHORT
    );
  };

  const handleSessionClick = (item: Session) => {
    if (props.onSessionSelect) {
      props.onSessionSelect(item.session_id);
    }

    const queryParam = item.document_identifier
      ? `?folder=${encodeURIComponent(item.document_identifier)}`
      : "";

    navigate(`/chat/${item.session_id}${queryParam}`);
  };

  return (
    <div className="dashboard-content">
      <DeleteConfirmationModal
        isOpen={showModalDelete}
        onClose={() => setShowModalDelete(false)}
        onConfirm={deleteSelectedSessions}
        title={`Delete session${selectedItems.length > 1 ? "s" : ""}`}
        itemName={selectedItems.length === 1 ? selectedItems[0].session_id : undefined}
        itemCount={selectedItems.length > 1 ? selectedItems.length : undefined}
        itemLabel="session"
      />

      {/* Header section */}
      <div className="dashboard-header">
        <div>
          <h1>Sessions</h1>
          <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
            Manage and access your previous chat conversations
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="action-button add-button"
            onClick={() => {
              const queryParams = props.documentIdentifier
                ? `?folder=${encodeURIComponent(props.documentIdentifier)}`
                : "";
              navigate(`/home${queryParams}`);
            }}
          >
            <LuPlus size={16} className="button-icon" />
            <span>New Session</span>
          </button>
          <button
            className="action-button danger-button"
            onClick={() => setShowModalDelete(true)}
            disabled={selectedItems.length === 0}
            style={{
              backgroundColor: selectedItems.length === 0 ? "#e5e7eb" : "#e74c3c",
              color: selectedItems.length === 0 ? "#9ca3af" : "white",
              cursor: selectedItems.length === 0 ? "not-allowed" : "pointer",
            }}
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
            aria-label="Refresh sessions list"
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
      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: "48px 2.5fr 1fr" }}>
          <div className="header-cell">
            <input
              type="checkbox"
              checked={
                paginatedItems.length > 0 &&
                selectedItems.length === paginatedItems.length
              }
              onChange={handleSelectAll}
              aria-label="Select all sessions"
              style={{ cursor: "pointer" }}
              disabled={isLoading || sortedSessions.length === 0}
            />
          </div>
          <div
            className="header-cell"
            onClick={() => !isLoading && handleSort("title")}
            style={{ cursor: isLoading ? "default" : "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              Title {!isLoading && getSortIcon("title")}
            </div>
          </div>
          <div
            className="header-cell"
            onClick={() => !isLoading && handleSort("time_stamp")}
            style={{ cursor: isLoading ? "default" : "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              Time {!isLoading && getSortIcon("time_stamp")}
            </div>
          </div>
        </div>
        <div className="table-body">
          {isLoading ? (
            <div className="table-loading">
              <div className="table-loading-spinner"></div>
            </div>
          ) : sortedSessions.length === 0 ? (
            <div className="no-data">
              <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>
                No sessions
              </div>
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div key={item.session_id} className="table-row" style={{ gridTemplateColumns: "48px 2.5fr 1fr" }}>
                <div className="row-cell">
                  <input
                    type="checkbox"
                    checked={selectedItems.some(
                      (i) => i.session_id === item.session_id
                    )}
                    onChange={(e) => handleSelectItem(item, e)}
                    aria-label={`Select ${item.title}`}
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div className="row-cell">
                  <button
                    onClick={() => {
                      if (props.onSessionSelect) {
                        props.onSessionSelect(item.session_id);
                      }

                      const queryParam = item.document_identifier
                        ? `?folder=${encodeURIComponent(
                            item.document_identifier
                          )}`
                        : "";

                      navigate(
                        `/chat/${item.session_id}${queryParam}`
                      );
                    }}
                    style={{
                      color: "#14558F",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    {item.title}
                  </button>
                </div>
                <div className="row-cell">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#666" }}>
                    <LuCalendar size={16} aria-hidden="true" />
                    <time dateTime={item.time_stamp}>
                      {formatSessionTime(item.time_stamp)}
                    </time>
                  </div>
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
            {sortedSessions.length} sessions
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
                className={`pagination-button ${currentPage === totalPages ? "disabled" : ""}`}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
              <button
                className={`pagination-button ${currentPage === totalPages ? "disabled" : ""}`}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
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
