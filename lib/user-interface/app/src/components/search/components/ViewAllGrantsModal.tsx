import React, { useRef, useEffect } from "react";
import { Spinner } from "react-bootstrap";
import { SearchDocument, PinnableGrant, GrantTypeId } from "../types";
import { GrantTypeBadge } from "./GrantTypeBadge";
import {
  modalOverlayStyle,
  modalContentStyle,
  modalHeaderStyle,
  modalBodyStyle,
} from "../styles/searchStyles";

interface ViewAllGrantsModalProps {
  isOpen: boolean;
  documents: SearchDocument[];
  pinnedGrants: PinnableGrant[];
  isLoading: boolean;
  grantTypeMap: Record<string, GrantTypeId | null>;
  onClose: () => void;
  onSelectGrant: (doc: SearchDocument) => void;
  onSelectPinnedGrant: (grant: PinnableGrant) => void;
}

export const ViewAllGrantsModal: React.FC<ViewAllGrantsModalProps> = ({
  isOpen,
  documents,
  pinnedGrants,
  isLoading,
  grantTypeMap,
  onClose,
  onSelectGrant,
  onSelectPinnedGrant,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap and restore focus on close
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[
          focusableElements.length - 1
        ] as HTMLElement;

        if (!firstElement || !lastElement) return;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus the modal
    if (modalRef.current) {
      const firstButton = modalRef.current.querySelector("button");
      if (firstButton) {
        firstButton.focus();
      }
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sortedDocuments = [...documents].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );

  const sortedPinnedGrants = [...pinnedGrants].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return (
    <div
      style={modalOverlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-all-grants-modal-title"
    >
      <div
        ref={modalRef}
        style={modalContentStyle}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Modal Header */}
        <div style={modalHeaderStyle}>
          <h2
            id="view-all-grants-modal-title"
            style={{
              margin: 0,
              fontSize: "24px",
              color: "#14558F",
              fontWeight: "600",
            }}
          >
            All Available Grants ({documents.length})
          </h2>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#555",
              fontSize: "28px",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "background-color 0.2s",
            }}
            onClick={onClose}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.outline = "none";
            }}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div style={modalBodyStyle}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <Spinner
                animation="border"
                variant="primary"
                role="status"
                style={{ width: "3rem", height: "3rem" }}
              >
                <span className="visually-hidden">Loading...</span>
              </Spinner>
              <div style={{ marginTop: "15px", color: "#666" }}>
                Loading grants...
              </div>
            </div>
          ) : (
            <>
              {/* Pinned Grants Section */}
              {sortedPinnedGrants.length > 0 && (
                <div style={{ marginBottom: "30px" }}>
                  <h3
                    style={{
                      fontSize: "18px",
                      color: "#14558F",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ marginRight: "8px" }}
                      aria-hidden="true"
                    >
                      <path
                        d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z"
                        fill="#008798"
                      />
                    </svg>
                    Pinned Grants ({sortedPinnedGrants.length})
                  </h3>
                  <div
                    style={{
                      border: "1px solid #e0e0e0",
                      borderRadius: "8px",
                      backgroundColor: "#fff",
                    }}
                  >
                    {sortedPinnedGrants.map((grant, index) => (
                      <div
                        key={`pinned-${grant.name}`}
                        style={{
                          padding: "14px 16px",
                          borderBottom:
                            index < sortedPinnedGrants.length - 1
                              ? "1px solid #e0e0e0"
                              : "none",
                          cursor: "pointer",
                          transition: "background-color 0.2s ease",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                        onClick={() => {
                          onSelectPinnedGrant(grant);
                          onClose();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectPinnedGrant(grant);
                            onClose();
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#f0ffff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${grant.name}`}
                        onFocus={(e) => {
                          e.currentTarget.style.backgroundColor = "#f0ffff";
                          e.currentTarget.style.outline = "2px solid #0088FF";
                          e.currentTarget.style.outlineOffset = "2px";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.outline = "none";
                        }}
                      >
                        <div
                          style={{
                            fontSize: "15px",
                            color: "#14558F",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <span>{grant.name}</span>
                          <GrantTypeBadge grantType={grant.grantType} />
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "14px",
                              backgroundColor: "#005a63",
                              color: "white",
                              padding: "3px 8px",
                              borderRadius: "12px",
                            }}
                          >
                            Pinned
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Grants Section */}
              <div>
                <h3
                  style={{
                    fontSize: "18px",
                    color: "#14558F",
                    marginBottom: "16px",
                  }}
                >
                  All Grants ({sortedDocuments.length})
                </h3>
                <div
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                  }}
                >
                  {sortedDocuments.map((doc, index) => (
                    <div
                      key={`grant-${doc.label}`}
                      style={{
                        padding: "14px 16px",
                        borderBottom:
                          index < sortedDocuments.length - 1
                            ? "1px solid #e0e0e0"
                            : "none",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                      }}
                      onClick={() => {
                        onSelectGrant(doc);
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectGrant(doc);
                          onClose();
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f5f5f5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${doc.label}`}
                      onFocus={(e) => {
                        e.currentTarget.style.backgroundColor = "#f5f5f5";
                        e.currentTarget.style.outline = "2px solid #0088FF";
                        e.currentTarget.style.outlineOffset = "2px";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.outline = "none";
                      }}
                    >
                      <div
                        style={{
                          fontSize: "15px",
                          color: "#333",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span>{doc.label}</span>
                        <GrantTypeBadge grantType={grantTypeMap[doc.label]} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewAllGrantsModal;
