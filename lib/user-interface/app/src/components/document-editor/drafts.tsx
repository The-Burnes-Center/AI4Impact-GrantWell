import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
} from "react";
import { Auth } from "aws-amplify";
import { DraftsClient } from "../../common/api-client/drafts-client";
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

// Styles for the drafts component
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
    padding: "12px 16px",
    textAlign: "left" as const,
    backgroundColor: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    cursor: "pointer",
    userSelect: "none" as const,
  },
  tableHeaderContent: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  tableCell: {
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
  },
  checkboxCell: {
    width: "40px",
    textAlign: "center" as const,
  },
  checkbox: {
    margin: 0,
  },
  link: {
    color: "#1a73e8",
    textDecoration: "none",
  },
  dateCell: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  calendarIcon: {
    color: "#6b7280",
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "48px",
  },
  spinner: {
    border: "4px solid #f3f3f3",
    borderTop: "4px solid #3498db",
    borderRadius: "50%",
    width: "40px",
    height: "40px",
    animation: "spin 1s linear infinite",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "48px",
  },
  emptyStateTitle: {
    fontSize: "18px",
    color: "#6b7280",
    marginBottom: "8px",
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    borderTop: "1px solid #e5e7eb",
  },
  pageInfo: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  pageSizeSelect: {
    padding: "4px 8px",
    borderRadius: "4px",
    border: "1px solid #d1d5db",
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

export interface DraftsProps {
  readonly documentIdentifier: string | null;
  onDraftSelect?: (sessionId: string) => void;
}

interface Draft {
  sessionId: string;
  title: string;
  lastModified: string;
  documentIdentifier?: string;
}

export default function Drafts(props: DraftsProps) {
  const appContext = useContext(AppContext);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Draft[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const [sortField, setSortField] = useState<"title" | "lastModified">("lastModified");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const navigate = useNavigate();

  const { documentIdentifier } = props;

  const getDrafts = useCallback(async () => {
    if (!appContext) return;

    try {
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      if (username) {
        const result = await draftsClient.getDrafts(username, documentIdentifier, true);
        setDrafts(result);
      }
    } catch (e) {
      console.error("Error fetching drafts:", e);
      setDrafts([]);
    }
  }, [appContext, documentIdentifier]);

  useEffect(() => {
    if (!appContext) return;

    const loadDrafts = async () => {
      setIsLoading(true);
      await getDrafts();
      setIsLoading(false);
    };

    loadDrafts();
  }, [appContext, getDrafts]);

  const deleteSelectedDrafts = async () => {
    if (!appContext || selectedItems.length === 0) return;

    try {
      setIsLoading(true);
      const draftsClient = new DraftsClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      await Promise.all(
        selectedItems.map((draft) =>
          draftsClient.deleteDraft(draft.sessionId, username)
        )
      );

      setSelectedItems([]);
      setShowModalDelete(false);
      await getDrafts();
    } catch (e) {
      console.error("Error deleting drafts:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedItems(e.target.checked ? paginatedItems : []);
  };

  const handleSelectItem = (
    item: Draft,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.checked) {
      setSelectedItems((prev) => [...prev, item]);
    } else {
      setSelectedItems((prev) =>
        prev.filter((i) => i.sessionId !== item.sessionId)
      );
    }
  };

  const handleSort = (field: "title" | "lastModified") => {
    setSortDirection((prev) =>
      sortField === field ? (prev === "asc" ? "desc" : "asc") : "asc"
    );
    setSortField(field);
  };

  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => {
      const sortMultiplier = sortDirection === "asc" ? 1 : -1;

      if (sortField === "title") {
        return sortMultiplier * a.title.localeCompare(b.title);
      } else {
        return (
          sortMultiplier *
          (new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime())
        );
      }
    });
  }, [drafts, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedDrafts.length / pageSize);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedDrafts.slice(startIndex, startIndex + pageSize);
  }, [sortedDrafts, currentPage, pageSize]);

  const getSortIcon = (field: "title" | "lastModified") => {
    if (sortField !== field) return <FaSort />;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  const formatDraftTime = (timestamp: string) => {
    return DateTime.fromISO(new Date(timestamp).toISOString()).toLocaleString(
      DateTime.DATETIME_SHORT
    );
  };

  const handleDraftClick = (item: Draft) => {
    if (props.onDraftSelect) {
      props.onDraftSelect(item.sessionId);
    }

    navigate(`/document-editor/${item.sessionId}`);
  };

  return (
    <div style={styles.container}>
      {showModalDelete && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              {`Delete draft${selectedItems.length > 1 ? "s" : ""}`}
            </div>
            <div style={styles.modalContent}>
              Do you want to delete{" "}
              {selectedItems.length === 1
                ? `draft ${selectedItems[0].sessionId}?`
                : `${selectedItems.length} drafts?`}
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
                onClick={deleteSelectedDrafts}
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
            <h1 style={styles.headerTitle}>Document Drafts</h1>
            <p style={styles.headerDescription}>
              Manage and access your grant application drafts
            </p>
          </div>
          <div style={styles.buttonContainer}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => navigate(`/document-editor`)}
            >
              <FaPlus size={16} /> New Draft
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
                await getDrafts();
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
        ) : sortedDrafts.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyStateTitle}>No drafts</div>
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
                  onClick={() => handleSort("lastModified")}
                >
                  <div style={styles.tableHeaderContent}>
                    Last Modified {getSortIcon("lastModified")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.sessionId}>
                  <td style={{ ...styles.tableCell, ...styles.checkboxCell }}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={selectedItems.some(
                        (i) => i.sessionId === item.sessionId
                      )}
                      onChange={(e) => handleSelectItem(item, e)}
                    />
                  </td>
                  <td style={styles.tableCell}>
                    <button
                      onClick={() => handleDraftClick(item)}
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
                      {formatDraftTime(item.lastModified)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && sortedDrafts.length > 0 && (
        <div style={styles.pagination}>
          <div style={styles.pageInfo}>
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, sortedDrafts.length)} of{" "}
              {sortedDrafts.length} results
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