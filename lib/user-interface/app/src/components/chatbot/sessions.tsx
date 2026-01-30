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
import { FaSort, FaSortUp, FaSortDown, FaPlus, FaTrash, FaSync } from "react-icons/fa";
import { Calendar } from "react-feather";
import "../../pages/Dashboard/styles.css";

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
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "450px",
    maxWidth: "90%",
    padding: "24px",
  },
  modalHeader: {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e5e7eb",
  },
  modalContent: {
    marginBottom: "24px",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
  },
};

export interface SessionsProps {
  readonly toolsOpen: boolean;
  readonly documentIdentifier: string | null;
  onSessionSelect?: (sessionId: string) => void;
}

interface Session {
  session_id: string;
  title: string;
  time_stamp: string;
  document_identifier?: string;
}

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

  // Refs for delete modal focus management
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const deleteModalPreviousFocusRef = useRef<HTMLElement | null>(null);

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

  // Focus management for delete modal
  useEffect(() => {
    if (!showModalDelete) return;

    // Store the currently focused element
    deleteModalPreviousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the modal after a short delay
    setTimeout(() => {
      const firstFocusable = deleteModalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 100);

    // Restore focus when modal closes
    return () => {
      // Only restore focus if the element still exists in the DOM
      if (
        deleteModalPreviousFocusRef.current &&
        document.body.contains(deleteModalPreviousFocusRef.current)
      ) {
        deleteModalPreviousFocusRef.current.focus();
      }
    };
  }, [showModalDelete]);

  // Focus trap handler for delete modal
  useEffect(() => {
    if (!showModalDelete || !deleteModalRef.current) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements =
        deleteModalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Check if currently focused element is inside the modal
      const activeElement = document.activeElement as HTMLElement;
      const isInsideModal = deleteModalRef.current?.contains(activeElement);

      // If focus is outside the modal, bring it back
      if (!isInsideModal) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModalDelete(false);
      }
    };

    document.addEventListener("keydown", handleTabKey);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleTabKey);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showModalDelete]);

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
    if (sortField !== field) return <FaSort />;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
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
      {showModalDelete && (
        <div
          className="modal-overlay"
          onClick={() => setShowModalDelete(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            ref={deleteModalRef}
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <div className="modal-header">
              <h2 id="delete-modal-title">
                {`Delete session${selectedItems.length > 1 ? "s" : ""}`}
              </h2>
            </div>
            <div className="modal-body">
              <p>
                Do you want to delete{" "}
                {selectedItems.length === 1
                  ? `session ${selectedItems[0].session_id}?`
                  : `${selectedItems.length} sessions?`}
              </p>
              <div className="modal-actions">
                <button
                  className="modal-button secondary"
                  onClick={() => setShowModalDelete(false)}
                  aria-label="Cancel delete"
                >
                  Cancel
                </button>
                <button
                  className="modal-button danger"
                  onClick={deleteSelectedSessions}
                  aria-label={`Confirm delete ${selectedItems.length} session${
                    selectedItems.length > 1 ? "s" : ""
                  }`}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <FaPlus size={16} /> New Session
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
            <FaTrash size={16} /> Delete
          </button>
          <button
            className="action-button refresh-button"
            onClick={async () => {
              setIsLoading(true);
              await getSessions();
              setIsLoading(false);
            }}
            aria-label="Refresh sessions list"
            aria-busy={isLoading}
          >
            <FaSync size={16} /> Refresh
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
                    <Calendar size={16} />
                    {formatSessionTime(item.time_stamp)}
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
