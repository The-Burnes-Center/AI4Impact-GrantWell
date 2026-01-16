import React from "react";
import { GrantTypeId, GRANT_TYPES } from "../types";

interface GrantTypeBadgeProps {
  grantType: GrantTypeId | null | undefined;
}

export const GrantTypeBadge: React.FC<GrantTypeBadgeProps> = ({ grantType }) => {
  if (!grantType || !GRANT_TYPES[grantType]) {
    return null;
  }

  const typeInfo = GRANT_TYPES[grantType];

  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: typeInfo.color,
        color: "white",
        fontSize: "11px",
        padding: "2px 6px",
        borderRadius: "8px",
        fontWeight: "500",
        marginLeft: "8px",
        verticalAlign: "middle",
      }}
      aria-label={`Grant type: ${typeInfo.label}`}
    >
      {typeInfo.label}
    </span>
  );
};

export default GrantTypeBadge;
