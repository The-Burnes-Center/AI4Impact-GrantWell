import React from "react";
import { viewAllButtonStyle } from "../styles/searchStyles";

interface ViewAllGrantsButtonProps {
  onClick: () => void;
}

export const ViewAllGrantsButton: React.FC<ViewAllGrantsButtonProps> = ({
  onClick,
}) => {
  return (
    <button
      style={viewAllButtonStyle}
      onClick={onClick}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = "#104472";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = "#14558F";
      }}
      onFocus={(e) => {
        e.currentTarget.style.backgroundColor = "#104472";
        e.currentTarget.style.outline = "2px solid #0088FF";
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.backgroundColor = "#14558F";
        e.currentTarget.style.outline = "none";
      }}
      aria-label="View all available grants"
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
          d="M3 13H5V11H3V13ZM3 17H5V15H3V17ZM3 9H5V7H3V9ZM7 13H21V11H7V13ZM7 17H21V15H7V17ZM7 7V9H21V7H7Z"
          fill="white"
        />
      </svg>
      View All Grants
    </button>
  );
};

export default ViewAllGrantsButton;
