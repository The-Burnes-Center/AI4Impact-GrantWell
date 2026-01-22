import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { DateTime } from "luxon";
import { FaSort, FaSortUp, FaSortDown, FaPlus, FaTrash, FaSync } from "react-icons/fa";
import { Calendar } from "react-feather";
import { useNavigate } from "react-router-dom";
import { Utils } from "../../common/utils";
import { DraftStatus } from "../../common/api-client/drafts-client";

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px",
    backgroundColor: "#f9fafb",
    minHeight: "100vh",
  },
  header: {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    marginBottom: "24px",
  },
  headerContainer: {
    padding: "24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: "600",
    margin: "0 0 8px 0",
  },
  headerDescription: {
    color: "#5a6169",
    margin: 0,
  },
  buttonContainer: {
    display: "flex",
    gap: "12px",
  },
  button: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
  },
  dangerButton: {
    backgroundColor: "#dc2626",
    color: "white",
    border: "none",
  },
  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  table: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    borderCollapse: "collapse" as const,
  },
  tableHeader: {
    padding: "12px 24px",
    textAlign: "left" as const,
    borderBottom: "1px solid #e5e7eb",
    color: "#374151",
    fontSize: "14px",
    fontWeight: "600",
  },
  tableHeaderButton: {
    background: "none",
    border: "none",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    color: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
  },
  tableCell: {
    padding: "12px 24px",
    fontSize: "14px",
    color: "#374151",
    borderBottom: "1px solid #e5e7eb",
  },
  checkboxCell: {
    width: "48px",
  },
  checkbox: {
    width: "16px",
    height: "16px",
  },
  dateCell: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  calendarIcon: {
    color: "#5a6169",
  },
  link: {
    color: "#2563eb",
    textDecoration: "none",
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

export interface DocEditorSessionsProps {
  readonly toolsOpen: boolean;
  readonly documentIdentifier: string | null;
  onSessionSelect?: (sessionId: string) => void;
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

  const { documentIdentifier } = props;

  const getSessions = async () => {
    if (!appContext) return;

    try {
      const apiClient = new ApiClient(appContext);
      const username = (await Auth.currentAuthenticatedUser()).username;

      if (username) {
        // Get all drafts regardless of NOFO - pass null to get all drafts
        const result = await apiClient.drafts.getDrafts(username, null);
        setSessions(result.map(draft => ({
          draft_id: draft.sessionId,
          title: draft.title,
          created_at: draft.lastModified,
          last_modified: draft.lastModified,
          document_identifier: draft.documentIdentifier,
          status: draft.status || 'nofo_selected'
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
    if (sortField !== field) return <FaSort />;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  const formatSessionTime = (timestamp: string) => {
    return Utils.formatTimestamp(timestamp);
  };

  const getStatusLabel = (status?: DraftStatus): string => {
    switch (status) {
      case 'nofo_selected':
        return 'NOFO Selected';
      case 'in_progress':
        return 'In Progress';
      case 'draft_generated':
        return 'Draft Generated';
      case 'review_ready':
        return 'Ready for Review';
      case 'submitted':
        return 'Submitted';
      default:
        return 'NOFO Selected';
    }
  };

  const getStatusColor = (status?: DraftStatus): string => {
    switch (status) {
      case 'nofo_selected':
        return '#6b7280'; // gray - meets WCAG AA contrast
      case 'in_progress':
        return '#2563eb'; // blue - meets WCAG AA contrast
      case 'draft_generated':
        return '#059669'; // green - meets WCAG AA contrast
      case 'review_ready':
        return '#d97706'; // amber - meets WCAG AA contrast
      case 'submitted':
        return '#7c3aed'; // purple - meets WCAG AA contrast
      default:
        return '#6b7280';
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
                ? `draft ${selectedItems[0].draft_id}?`
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
                onClick={deleteSelectedSessions}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <div style={styles.headerContainer}>
          <div>
            <h1 style={styles.headerTitle}>Drafts</h1>
            <p style={styles.headerDescription}>
              Manage and access your saved grant application drafts
            </p>
          </div>
          <div style={styles.buttonContainer}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => {
                navigate(`/document-editor`);
              }}
              aria-label="Create new draft"
            >
              <FaPlus size={16} aria-hidden="true" /> New Draft
            </button>
            <button
              style={{
                ...styles.button,
                ...styles.dangerButton,
                ...(selectedItems.length === 0 ? styles.disabledButton : {}),
              }}
              onClick={() => setShowModalDelete(true)}
              disabled={selectedItems.length === 0}
              aria-label={selectedItems.length === 0 ? "Delete drafts (no drafts selected)" : `Delete ${selectedItems.length} selected draft${selectedItems.length > 1 ? 's' : ''}`}
              aria-disabled={selectedItems.length === 0}
            >
              <FaTrash size={16} aria-hidden="true" /> Delete
            </button>
            <button
              style={{ ...styles.button }}
              onClick={async () => {
                setIsLoading(true);
                await getSessions();
                setIsLoading(false);
              }}
              aria-label="Refresh drafts list"
              aria-busy={isLoading}
            >
              <FaSync size={16} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <table 
        style={styles.table}
        role="table"
        aria-label="Draft sessions list"
      >
        <thead>
          <tr role="row">
            <th style={{ ...styles.tableHeader, ...styles.checkboxCell }} role="columnheader" scope="col">
              <label htmlFor="select-all-drafts" style={{ display: "none" }}>
                Select all drafts
              </label>
              <input
                id="select-all-drafts"
                type="checkbox"
                style={styles.checkbox}
                checked={selectedItems.length === sessions.length}
                onChange={handleSelectAll}
                aria-label="Select all drafts"
              />
            </th>
            <th style={styles.tableHeader} role="columnheader" scope="col">
              <button
                style={styles.tableHeaderButton}
                onClick={() => handleSort("title")}
                aria-label={`Sort by title, ${sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "not sorted"}`}
                aria-sort={sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                Title {getSortIcon("title")}
              </button>
            </th>
            <th style={styles.tableHeader} role="columnheader" scope="col">
              <button
                style={styles.tableHeaderButton}
                onClick={() => handleSort("last_modified")}
                aria-label={`Sort by last modified, ${sortField === "last_modified" ? (sortDirection === "asc" ? "ascending" : "descending") : "not sorted"}`}
                aria-sort={sortField === "last_modified" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                Last Modified {getSortIcon("last_modified")}
              </button>
            </th>
            <th style={styles.tableHeader} role="columnheader" scope="col">
              <span>NOFO</span>
            </th>
            <th style={styles.tableHeader} role="columnheader" scope="col">
              <span>Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => (
            <tr key={item.draft_id} role="row">
              <td style={{ ...styles.tableCell, ...styles.checkboxCell }} role="gridcell">
                <label htmlFor={`draft-checkbox-${item.draft_id}`} style={{ display: "none" }}>
                  Select draft: {item.title}
                </label>
                <input
                  id={`draft-checkbox-${item.draft_id}`}
                  type="checkbox"
                  style={styles.checkbox}
                  checked={selectedItems.some(
                    (i) => i.draft_id === item.draft_id
                  )}
                  onChange={(e) => handleSelectItem(item, e)}
                  aria-label={`Select draft: ${item.title}`}
                />
              </td>
              <td style={styles.tableCell} role="gridcell">
                <button
                  onClick={() => {
                    if (props.onSessionSelect) {
                      props.onSessionSelect(item.draft_id);
                    }
                  }}
                  aria-label={`Open draft: ${item.title}`}
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
              <td style={styles.tableCell} role="gridcell">
                <div style={styles.dateCell}>
                  <Calendar size={16} style={styles.calendarIcon} aria-hidden="true" />
                  <time dateTime={item.last_modified}>
                    {formatSessionTime(item.last_modified)}
                  </time>
                </div>
              </td>
              <td style={styles.tableCell} role="gridcell">
                <span aria-label={`NOFO: ${item.document_identifier || 'Not specified'}`}>
                  {item.document_identifier || '—'}
                </span>
              </td>
              <td style={styles.tableCell} role="gridcell">
                <span 
                  role="status"
                  aria-label={`Draft status: ${getStatusLabel(item.status)}`}
                  style={statusBadgeStyle(item.status)}
                >
                  {getStatusLabel(item.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 