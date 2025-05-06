import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import RouterButton from "../wrappers/router-button";
import { DateTime } from "luxon";
import { useNavigate } from "react-router";
// Import icons for buttons
import {
  FaPlus,
  FaTrash,
  FaSync,
  FaTimes,
  FaCheck,
  FaSort,
  FaSortUp,
  FaSortDown,
} from "react-icons/fa";

export interface SessionsProps {
  readonly toolsOpen: boolean;
  readonly documentIdentifier: string | null;
}

interface Session {
  session_id: string;
  title: string;
  time_stamp: string;
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

  // Styles
  const containerStyle = {
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "20px",
  };

  const headerContainerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  };

  const headerStyle = {
    fontSize: "24px",
    fontWeight: 600,
    margin: 0,
  };

  const headerDescriptionStyle = {
    fontSize: "14px",
    color: "#5f6b7a",
    marginTop: "4px",
  };

  const buttonContainerStyle = {
    display: "flex",
    gap: "12px",
  };

  const buttonStyle = {
    padding: "8px 16px",
    backgroundColor: "#006499",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 500,
  };

  const disabledButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#cccccc",
    cursor: "not-allowed",
  };

  const tableContainerStyle = {
    overflowX: "auto" as const,
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse" as const,
    border: "1px solid #eaeded",
  };

  const tableHeaderStyle = {
    backgroundColor: "#f2f3f3",
    padding: "12px 16px",
    textAlign: "left" as const,
    fontWeight: 600,
    borderBottom: "1px solid #eaeded",
    cursor: "pointer",
    userSelect: "none" as const,
  };

  const tableCellStyle = {
    padding: "12px 16px",
    borderBottom: "1px solid #eaeded",
  };

  const checkboxCellStyle = {
    width: "40px",
    textAlign: "center" as const,
  };

  const checkboxStyle = {
    cursor: "pointer",
  };

  const linkStyle = {
    color: "#0073bb",
    textDecoration: "none",
    ":hover": {
      textDecoration: "underline",
    },
  };

  const paginationStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "16px",
  };

  const pageInfoStyle = {
    fontSize: "14px",
    color: "#5f6b7a",
  };

  const pageSizeSelectStyle = {
    padding: "6px 8px",
    borderRadius: "4px",
    border: "1px solid #d1d5db",
    marginLeft: "8px",
  };

  const paginationButtonsStyle = {
    display: "flex",
    gap: "8px",
  };

  const paginationButtonStyle = {
    padding: "6px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    backgroundColor: "white",
    cursor: "pointer",
  };

  const disabledPaginationButtonStyle = {
    ...paginationButtonStyle,
    backgroundColor: "#f3f4f6",
    color: "#9ca3af",
    cursor: "not-allowed",
  };

  const modalOverlayStyle = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: showModalDelete ? "flex" : "none",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  };

  const modalStyle = {
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    width: "500px",
    maxWidth: "90%",
    padding: "24px",
  };

  const modalHeaderStyle = {
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "16px",
    paddingBottom: "12px",
    borderBottom: "1px solid #e1e4e8",
  };

  const modalFooterStyle = {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "20px",
    gap: "12px",
  };

  const loadingContainerStyle = {
    display: "flex",
    justifyContent: "center",
    padding: "40px",
  };

  const spinnerStyle = {
    border: "4px solid rgba(0, 0, 0, 0.1)",
    borderTop: "4px solid #006499",
    borderRadius: "50%",
    width: "30px",
    height: "30px",
    animation: "spin 1s linear infinite",
  };

  const emptyStateStyle = {
    textAlign: "center" as const,
    padding: "40px",
    color: "#5f6b7a",
  };

  const getSessions = useCallback(async () => {
    if (!appContext) return;
    let username;
    const apiClient = new ApiClient(appContext);
    try {
      await Auth.currentAuthenticatedUser().then(
        (value) => (username = value.username)
      );
      if (username) {
        const result = await apiClient.sessions.getSessions(
          username,
          documentIdentifier,
          true
        );
        setSessions(result);
      }
    } catch (e) {
      console.log(e);
      setSessions([]);
    }
  }, [appContext, documentIdentifier]);

  useEffect(() => {
    if (!appContext) return;

    (async () => {
      setIsLoading(true);
      await getSessions();
      setIsLoading(false);
    })();
  }, [appContext, getSessions, props.toolsOpen, documentIdentifier]);

  // Add keyframes for spinner animation
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  const deleteSelectedSessions = async () => {
    if (!appContext) return;
    let username;
    await Auth.currentAuthenticatedUser().then(
      (value) => (username = value.username)
    );
    setIsLoading(true);
    const apiClient = new ApiClient(appContext);
    await Promise.all(
      selectedItems.map((s) =>
        apiClient.sessions.deleteSession(s.session_id, username)
      )
    );
    setSelectedItems([]);
    setShowModalDelete(false);
    await getSessions();
    setIsLoading(false);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(paginatedItems);
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (
    item: Session,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.checked) {
      setSelectedItems([...selectedItems, item]);
    } else {
      setSelectedItems(
        selectedItems.filter((i) => i.session_id !== item.session_id)
      );
    }
  };

  const handleSort = (field: "title" | "time_stamp") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (sortField === "title") {
        return sortDirection === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      } else {
        return sortDirection === "asc"
          ? new Date(a.time_stamp).getTime() - new Date(b.time_stamp).getTime()
          : new Date(b.time_stamp).getTime() - new Date(a.time_stamp).getTime();
      }
    });
  }, [sessions, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedSessions.length / pageSize);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedSessions.slice(startIndex, endIndex);
  }, [sortedSessions, currentPage, pageSize]);

  const getSortIcon = (field: "title" | "time_stamp") => {
    if (sortField !== field) return <FaSort />;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  return (
    <div style={containerStyle}>
      {/* Delete confirmation modal */}
      <div style={modalOverlayStyle}>
        <div style={modalStyle}>
          <div style={modalHeaderStyle}>
            {"Delete session" + (selectedItems.length > 1 ? "s" : "")}
          </div>
          <div>
            Do you want to delete{" "}
            {selectedItems.length == 1
              ? `session ${selectedItems[0].session_id}?`
              : `${selectedItems.length} sessions?`}
          </div>
          <div style={modalFooterStyle}>
            <button
              style={buttonStyle}
              onClick={() => setShowModalDelete(false)}
            >
              Cancel
            </button>
            <button style={buttonStyle} onClick={deleteSelectedSessions}>
              Ok
            </button>
          </div>
        </div>
      </div>

      {/* Header section */}
      <div>
        <div style={headerContainerStyle}>
          <div>
            <h1 style={headerStyle}>Sessions</h1>
            <div style={headerDescriptionStyle}>
              View or delete any of your past 100 sessions
            </div>
          </div>
          <div style={buttonContainerStyle}>
            <button
              style={buttonStyle}
              onClick={() => {
                navigate(
                  `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
                    documentIdentifier || ""
                  )}`
                );
              }}
            >
              <FaPlus /> New session
            </button>
            <button style={buttonStyle} onClick={() => getSessions()}>
              <FaSync /> Refresh
            </button>
            <button
              style={
                selectedItems.length === 0 ? disabledButtonStyle : buttonStyle
              }
              disabled={selectedItems.length === 0}
              onClick={() => {
                if (selectedItems.length > 0) setShowModalDelete(true);
              }}
            >
              <FaTrash /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Table section */}
      <div style={tableContainerStyle}>
        {isLoading ? (
          <div style={loadingContainerStyle}>
            <div style={spinnerStyle}></div>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div style={emptyStateStyle}>
            <b>No sessions</b>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={checkboxCellStyle}>
                  <input
                    type="checkbox"
                    style={checkboxStyle}
                    checked={
                      paginatedItems.length > 0 &&
                      selectedItems.length === paginatedItems.length
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th
                  style={tableHeaderStyle}
                  onClick={() => handleSort("title")}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    Title {getSortIcon("title")}
                  </div>
                </th>
                <th
                  style={tableHeaderStyle}
                  onClick={() => handleSort("time_stamp")}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    Time {getSortIcon("time_stamp")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.session_id}>
                  <td style={{ ...tableCellStyle, ...checkboxCellStyle }}>
                    <input
                      type="checkbox"
                      style={checkboxStyle}
                      checked={selectedItems.some(
                        (i) => i.session_id === item.session_id
                      )}
                      onChange={(e) => handleSelectItem(item, e)}
                    />
                  </td>
                  <td style={tableCellStyle}>
                    <Link
                      to={`/chatbot/playground/${item.session_id}`}
                      style={linkStyle}
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td style={tableCellStyle}>
                    {DateTime.fromISO(
                      new Date(item.time_stamp).toISOString()
                    ).toLocaleString(DateTime.DATETIME_SHORT)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && sortedSessions.length > 0 && (
        <div style={paginationStyle}>
          <div style={pageInfoStyle}>
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedSessions.length)} of{" "}
            {sortedSessions.length} items
            <select
              style={pageSizeSelectStyle}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div style={paginationButtonsStyle}>
            <button
              style={
                currentPage === 1
                  ? disabledPaginationButtonStyle
                  : paginationButtonStyle
              }
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              First
            </button>
            <button
              style={
                currentPage === 1
                  ? disabledPaginationButtonStyle
                  : paginationButtonStyle
              }
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              style={
                currentPage === totalPages
                  ? disabledPaginationButtonStyle
                  : paginationButtonStyle
              }
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
            <button
              style={
                currentPage === totalPages
                  ? disabledPaginationButtonStyle
                  : paginationButtonStyle
              }
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
