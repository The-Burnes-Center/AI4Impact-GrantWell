import React from "react";
import { Spinner } from "react-bootstrap";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { GrantRecommendation, GrantTypeId } from "../types";
import { GrantTypeBadge } from "./GrantTypeBadge";
import {
  aiSuggestionCardStyle,
  aiLoadingStyle,
  aiErrorStyle,
  aiPromptStyle,
} from "../styles/searchStyles";

interface AISuggestionsSectionProps {
  searchTerm: string;
  isSearching: boolean;
  triggered: boolean;
  error: string | null;
  results: GrantRecommendation[];
  loadingMessage: string;
  grantTypeMap: Record<string, GrantTypeId | null>;
  expandedGrants: Record<string, boolean>;
  hasPinnedGrants: boolean;
  onSelectGrant: (summaryUrl: string, grantName: string) => void;
  onToggleExpanded: (grantKey: string, e: React.MouseEvent) => void;
  onTriggerSearch: () => void;
  onBrowseAll: () => void;
}

export const AISuggestionsSection: React.FC<AISuggestionsSectionProps> = ({
  searchTerm,
  isSearching,
  triggered,
  error,
  results,
  loadingMessage,
  grantTypeMap,
  expandedGrants,
  hasPinnedGrants,
  onSelectGrant,
  onToggleExpanded,
  onTriggerSearch,
  onBrowseAll,
}) => {
  return (
    <div
      role="region"
      aria-label="Relevant grant suggestions"
      aria-busy={isSearching}
      style={{
        borderTop: hasPinnedGrants ? "2px solid #e0e0e0" : "none",
        marginTop: hasPinnedGrants ? "8px" : "0",
        paddingTop: hasPinnedGrants ? "12px" : "0",
      }}
    >
      {/* Loading State */}
      {isSearching && (
        <div role="status" aria-live="polite" aria-busy="true" style={aiLoadingStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <Spinner
              animation="border"
              size="sm"
              variant="primary"
              aria-hidden="true"
            />
            <div>
              <div
                style={{
                  color: "#14558F",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                {loadingMessage}
              </div>
              <div
                style={{
                  marginTop: "4px",
                  color: "#999",
                  fontSize: "12px",
                }}
              >
                Finding relevant grants...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isSearching && (
        <div role="alert" aria-live="assertive" style={aiErrorStyle}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {!isSearching && !error && results.length > 0 && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          <div
            role="heading"
            aria-level={2}
            id="ai-suggestions-heading"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 0",
              fontSize: "13px",
              fontWeight: "600",
              color: "#14558F",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="#14558F"
                strokeWidth="2"
              />
              <path
                d="M8 12H8.01M12 12H12.01M16 12H16.01"
                stroke="#14558F"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Relevant Grants for "{searchTerm}"
          </div>
          <div style={{ maxHeight: "250px", overflowY: "auto" }}>
            {results.map((grant, index) => {
              const grantName = grant.name || "";
              const grantKey = `ai-grant-${grantName}-${index}`;
              const isExpanded = !!expandedGrants[grantKey];

              return (
                <div key={grantKey} style={aiSuggestionCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() => onSelectGrant(grant.summaryUrl, grantName)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                      aria-label={`Select ${grantName}`}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "500",
                          color: "#14558F",
                        }}
                      >
                        {grantName}
                      </span>
                      <GrantTypeBadge grantType={grantTypeMap[grantName]} />
                    </button>
                    {grant.keyRequirements && grant.keyRequirements.length > 0 && (
                      <button
                        id={`${grantKey}-details-button`}
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`${grantKey}-details`}
                        aria-label={`${
                          isExpanded ? "Collapse" : "Expand"
                        } details for ${grantName}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          fontSize: "12px",
                          color: "#666",
                          cursor: "pointer",
                          padding: "4px 8px",
                          backgroundColor: "#fff",
                          borderRadius: "4px",
                          border: "1px solid #e0e0e0",
                        }}
                        onClick={(e) => onToggleExpanded(grantKey, e)}
                      >
                        {isExpanded ? (
                          <LuChevronDown
                            size={14}
                            style={{ marginRight: "4px" }}
                            aria-hidden="true"
                          />
                        ) : (
                          <LuChevronRight
                            size={14}
                            style={{ marginRight: "4px" }}
                            aria-hidden="true"
                          />
                        )}
                        <span>Details</span>
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div
                      id={`${grantKey}-details`}
                      role="region"
                      aria-labelledby={`${grantKey}-details-button`}
                      style={{
                        fontSize: "13px",
                        color: "#666",
                        marginTop: "10px",
                        padding: "10px",
                        backgroundColor: "#fff",
                        borderRadius: "4px",
                      }}
                    >
                      {grant.keyRequirements.length > 0 ? (
                        <ul style={{ margin: "0 0 0 16px", padding: "0" }}>
                          {grant.keyRequirements.map((req, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>
                              {req}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: "0", fontStyle: "italic" }}>
                          Click to view full grant details.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompt to trigger search */}
      {!isSearching && !triggered && (
        <div style={aiPromptStyle}>
          <div style={{ fontSize: "13px", color: "#333" }}>
            {searchTerm.length > 0 ? (
              <>
                <strong>Press Enter</strong> to find relevant grants for "
                {searchTerm}"
                {searchTerm.length < 3 && (
                  <span style={{ display: "block", fontSize: "12px", color: "#666", marginTop: "4px" }}>
                    (Search runs automatically after 3 characters)
                  </span>
                )}
              </>
            ) : (
              <>
                <strong>Type and press Enter</strong> to find relevant grants
                <span style={{ display: "block", fontSize: "12px", color: "#666", marginTop: "4px" }}>
                  (Search runs automatically after 3 characters)
                </span>
              </>
            )}
          </div>
          <button
            onClick={onTriggerSearch}
            aria-label={`Find relevant grants for "${searchTerm || "your search"}"`}
            disabled={!searchTerm.trim()}
            style={{
              backgroundColor: searchTerm.trim() ? "#14558F" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: "16px",
              padding: "6px 14px",
              fontSize: "13px",
              cursor: searchTerm.trim() ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
            onMouseOver={(e) => {
              if (searchTerm.trim()) {
                e.currentTarget.style.backgroundColor = "#104472";
              }
            }}
            onMouseOut={(e) => {
              if (searchTerm.trim()) {
                e.currentTarget.style.backgroundColor = "#14558F";
              }
            }}
            onFocus={(e) => {
              if (searchTerm.trim()) {
                e.currentTarget.style.outline = "2px solid #0088FF";
                e.currentTarget.style.outlineOffset = "2px";
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
            }}
          >
            Find Grants
          </button>
        </div>
      )}

      {/* No results */}
      {!isSearching && triggered && results.length === 0 && !error && (
        <div
          style={{
            padding: "16px",
            margin: "8px 12px",
            textAlign: "center",
            color: "#666",
            fontSize: "13px",
            backgroundColor: "#f9f9f9",
            borderRadius: "8px",
          }}
        >
          No relevant grants found for "{searchTerm}". Try different keywords.
        </div>
      )}
    </div>
  );
};

export default AISuggestionsSection;
