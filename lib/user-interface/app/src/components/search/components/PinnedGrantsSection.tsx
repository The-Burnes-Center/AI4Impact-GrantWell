import React from "react";
import { LuPinOff } from "react-icons/lu";
import { PinnableGrant } from "../types";
import { GrantTypeBadge } from "./GrantTypeBadge";
import {
  sectionHeaderStyle,
  pinnedItemStyle,
  selectedPinnedItemStyle,
  pinnedBadgeStyle,
  unpinButtonStyle,
} from "../styles/searchStyles";

interface PinnedGrantsSectionProps {
  grants: PinnableGrant[];
  selectedIndex: number;
  isAdmin: boolean;
  onSelect: (grant: PinnableGrant) => void;
  onUnpin: (grantName: string, event: React.MouseEvent) => void;
  onMouseEnter: (index: number) => void;
}

export const PinnedGrantsSection: React.FC<PinnedGrantsSectionProps> = ({
  grants,
  selectedIndex,
  isAdmin,
  onSelect,
  onUnpin,
  onMouseEnter,
}) => {
  if (grants.length === 0) return null;

  return (
    <>
      <div
        style={sectionHeaderStyle}
        role="heading"
        aria-level={2}
        id="pinned-grants-heading"
      >
        Pinned Grants
      </div>
      {grants.map((grant, index) => (
        <div
          key={`pinned-${index}`}
          id={`search-result-${index}`}
          role="option"
          aria-selected={selectedIndex === index}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            ...(selectedIndex === index
              ? selectedPinnedItemStyle
              : pinnedItemStyle),
            padding: "12px 15px",
          }}
          onMouseEnter={() => onMouseEnter(index)}
        >
          <button
            onClick={() => onSelect(grant)}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #0088FF";
              e.currentTarget.style.outlineOffset = "2px";
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
              cursor: "pointer",
              color: "inherit",
              fontSize: "inherit",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            aria-label={`Select ${grant.name}`}
          >
            <span>{grant.name}</span>
            <GrantTypeBadge grantType={grant.grantType} />
            <span style={pinnedBadgeStyle}>Pinned</span>
          </button>

          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={(e) => onUnpin(grant.name, e)}
                style={unpinButtonStyle}
                title="Unpin grant"
                aria-label={`Unpin ${grant.name}`}
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
            </div>
          )}
        </div>
      ))}
    </>
  );
};

export default PinnedGrantsSection;
