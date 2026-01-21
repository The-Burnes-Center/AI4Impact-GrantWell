import React from "react";
import { LuPin, LuPinOff } from "react-icons/lu";
import { SearchDocument, GrantRecommendation, GrantTypeId } from "../types";
import { GrantTypeBadge } from "./GrantTypeBadge";
import {
  sectionHeaderStyle,
  resultItemStyle,
  selectedItemStyle,
  pinButtonStyle,
  unpinButtonStyle,
} from "../styles/searchStyles";

interface AvailableGrantsSectionProps {
  documents: SearchDocument[];
  selectedIndex: number;
  baseIndex: number; // Starting index for keyboard navigation
  isAdmin: boolean;
  grantTypeMap: Record<string, GrantTypeId | null>;
  showDivider: boolean;
  isNofoPinned: (name: string) => boolean;
  onSelect: (doc: SearchDocument) => void;
  onPin: (grant: GrantRecommendation, event: React.MouseEvent) => void;
  onUnpin: (grantName: string, event: React.MouseEvent) => void;
  onMouseEnter: (index: number) => void;
}

export const AvailableGrantsSection: React.FC<AvailableGrantsSectionProps> = ({
  documents,
  selectedIndex,
  baseIndex,
  isAdmin,
  grantTypeMap,
  showDivider,
  isNofoPinned,
  onSelect,
  onPin,
  onUnpin,
  onMouseEnter,
}) => {
  if (documents.length === 0) return null;

  return (
    <>
      <div
        style={{
          ...sectionHeaderStyle,
          borderTop: showDivider ? "2px solid #e0e0e0" : "none",
          marginTop: showDivider ? "8px" : "0",
          paddingTop: showDivider ? "12px" : "0",
        }}
        role="heading"
        aria-level={2}
        id="available-grants-heading"
      >
        Available Grants
      </div>
      {documents.map((doc, index) => {
        const docName = doc.label || "";
        const isPinned = isNofoPinned(docName);
        const itemIndex = baseIndex + index;
        const isArchived = doc.status === "archived";

        return (
          <div
            key={`doc-${docName}-${index}`}
            id={`search-result-${itemIndex}`}
            role="option"
            aria-selected={selectedIndex === itemIndex}
            aria-disabled={isArchived}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              ...(selectedIndex === itemIndex ? selectedItemStyle : resultItemStyle),
              padding: "12px 15px",
              opacity: isArchived ? 0.7 : 1,
              backgroundColor: isArchived ? "#f5f5f5" : undefined,
            }}
            onMouseEnter={() => onMouseEnter(itemIndex)}
          >
            <div
              onClick={() => {
                if (isArchived) {
                  // Show tooltip or alert that the grant is expired
                  return;
                }
                onSelect(doc);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (!isArchived) {
                    onSelect(doc);
                  }
                }
              }}
              tabIndex={0}
              role="button"
              onFocus={(e) => {
                if (!isArchived) {
                  e.currentTarget.style.outline = "2px solid #0088FF";
                  e.currentTarget.style.outlineOffset = "2px";
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
              style={{
                flex: 1,
                textAlign: "left",
                background: "none",
                border: "none",
                padding: 0,
                cursor: isArchived ? "not-allowed" : "pointer",
                color: isArchived ? "#888" : "inherit",
                fontSize: "inherit",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
              }}
              aria-label={isArchived ? `${docName} (Expired - no longer accepting applications)` : `Select ${docName}`}
            >
              <span>{docName}</span>
              <GrantTypeBadge grantType={grantTypeMap[docName]} />
              {isArchived && (
                <span
                  style={{
                    backgroundColor: "#dc3545",
                    color: "white",
                    fontSize: "10px",
                    fontWeight: "600",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    marginLeft: "4px",
                    textTransform: "uppercase",
                  }}
                  title="This grant has expired and is no longer accepting applications"
                >
                  Expired
                </span>
              )}
            </div>

            {isAdmin && !isArchived && (
              <div style={{ display: "flex", alignItems: "center" }}>
                {isPinned ? (
                  <button
                    onClick={(e) => onUnpin(docName, e)}
                    style={unpinButtonStyle}
                    title="Unpin grant"
                    aria-label={`Unpin ${docName}`}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#f8e0e0";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = "#f8e0e0";
                      e.currentTarget.style.outline = "2px solid #0088FF";
                      e.currentTarget.style.outlineOffset = "2px";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.outline = "none";
                    }}
                  >
                    <LuPinOff size={20} color="#E74C3C" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      const grant: GrantRecommendation = {
                        id: "",
                        name: docName,
                        matchScore: 80,
                        eligibilityMatch: true,
                        matchReason: "Admin selected",
                        fundingAmount: "Varies",
                        deadline: "See details",
                        keyRequirements: [],
                        summaryUrl: doc.value,
                      };
                      onPin(grant, e);
                    }}
                    style={pinButtonStyle}
                    title="Pin grant to top of recommendations"
                    aria-label={`Pin ${docName}`}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#e0f0ff";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = "#e0f0ff";
                      e.currentTarget.style.outline = "2px solid #0088FF";
                      e.currentTarget.style.outlineOffset = "2px";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.outline = "none";
                    }}
                  >
                    <LuPin size={20} color="#14558F" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export default AvailableGrantsSection;
