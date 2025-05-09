import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { DateTime } from "luxon";
import { useNavigate } from "react-router";
import {
  Plus as FaPlus,
  Trash2 as FaTrash,
  RotateCw as FaSync,
  ChevronDown as FaSortDown,
  ChevronUp as FaSortUp,
  ArrowUpDown as FaSort,
  Calendar,
} from "lucide-react";

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
    color: "#6b7280",
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
    backgroundColor: "#ef4444",
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
    fontSize: "12px",
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
    color: "#6b7280",
    fontSize: "14px",
  },
  calendarIcon: {
    color: "#9ca3af",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    color: "#6b7280",
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
    color: "#6b7280",
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

    navigate(`/chatbot/playground/${item.session_id}${queryParam}`);
  };

  return (
    <div style={styles.container}>
      {showModalDelete && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              {`Delete session${selectedItems.length > 1 ? "s" : ""}`}
            </div>
            <div style={styles.modalContent}>
              Do you want to delete{" "}
              {selectedItems.length === 1
                ? `session ${selectedItems[0].session_id}?`
                : `${selectedItems.length} sessions?`}
            </div>
            <div style={styles.modalFooter}>
              <button
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={() => setShowModalDelete(false)}
              >
                Cancel
              </button>
              <button
                style={{ ...styles.button, ...styles.dangerButton }}
                onClick={deleteSelectedSessions}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header section */}
      <div style={styles.header}>
        <div style={styles.headerContainer}>
          <div>
            <h1 style={styles.headerTitle}>Sessions</h1>
            <p style={styles.headerDescription}>
              Manage and access your previous chat conversations
            </p>
          </div>
          <div style={styles.buttonContainer}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => {
                const queryParams = props.documentIdentifier
                  ? `?folder=${encodeURIComponent(props.documentIdentifier)}`
                  : "";
                navigate(`/landing-page/basePage${queryParams}`);
              }}
            >
              <FaPlus size={16} /> New Session
            </button>
            <button
              style={{
                ...styles.button,
                ...styles.dangerButton,
                ...(selectedItems.length === 0 ? styles.disabledButton : {}),
              }}
              onClick={() => setShowModalDelete(true)}
              disabled={selectedItems.length === 0}
            >
              <FaTrash size={16} /> Delete
            </button>
            <button
              style={{ ...styles.button }}
              onClick={async () => {
                setIsLoading(true);
                await getSessions();
                setIsLoading(false);
              }}
            >
              <FaSync size={16} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table section */}
      <div style={styles.tableContainer}>
        {isLoading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner}></div>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyStateTitle}>No sessions</div>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    style={styles.checkbox}
                    checked={
                      paginatedItems.length > 0 &&
                      selectedItems.length === paginatedItems.length
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th
                  style={styles.tableHeader}
                  onClick={() => handleSort("title")}
                >
                  <div style={styles.tableHeaderContent}>
                    Title {getSortIcon("title")}
                  </div>
                </th>
                <th
                  style={styles.tableHeader}
                  onClick={() => handleSort("time_stamp")}
                >
                  <div style={styles.tableHeaderContent}>
                    Time {getSortIcon("time_stamp")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.session_id}>
                  <td style={{ ...styles.tableCell, ...styles.checkboxCell }}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={selectedItems.some(
                        (i) => i.session_id === item.session_id
                      )}
                      onChange={(e) => handleSelectItem(item, e)}
                    />
                  </td>
                  <td style={styles.tableCell}>
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
                          `/chatbot/playground/${item.session_id}${queryParam}`
                        );
                      }}
                      style={{
                        ...styles.link,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "inherit",
                      }}
                    >
                      {item.title}
                    </button>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.dateCell}>
                      <Calendar size={16} style={styles.calendarIcon} />
                      {formatSessionTime(item.time_stamp)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && sortedSessions.length > 0 && (
        <div style={styles.pagination}>
          <div style={styles.pageInfo}>
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, sortedSessions.length)} of{" "}
              {sortedSessions.length} results
            </span>
            <select
              style={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
          <div style={styles.paginationButtons}>
            <button
              style={{
                ...styles.paginationButton,
                ...(currentPage === 1 ? styles.paginationButtonDisabled : {}),
              }}
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              First
            </button>
            <button
              style={{
                ...styles.paginationButton,
                ...(currentPage === 1 ? styles.paginationButtonDisabled : {}),
              }}
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              style={{
                ...styles.paginationButton,
                ...(currentPage === totalPages
                  ? styles.paginationButtonDisabled
                  : {}),
              }}
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
            <button
              style={{
                ...styles.paginationButton,
                ...(currentPage === totalPages
                  ? styles.paginationButtonDisabled
                  : {}),
              }}
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
