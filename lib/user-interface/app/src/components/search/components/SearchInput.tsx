import React, { forwardRef } from "react";
import { Spinner } from "react-bootstrap";
import { SearchIcon } from "./SearchIcon";
import {
  inputContainerStyle,
  labelStyle,
  searchIconStyle,
  getInputStyle,
  getClearButtonStyle,
} from "../styles/searchStyles";

interface SearchInputProps {
  searchTerm: string;
  isLoading: boolean;
  isSearching?: boolean;
  showResults: boolean;
  selectedIndex: number;
  disabled: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClear: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      searchTerm,
      isLoading,
      isSearching = false,
      showResults,
      selectedIndex,
      disabled,
      onChange,
      onFocus,
      onKeyDown,
      onClear,
    },
    ref
  ) => {
    const inputStyle = getInputStyle(isLoading);
    const clearButtonStyle = getClearButtonStyle(isLoading);

    return (
      <>
        <label htmlFor="grant-search-input" style={labelStyle}>
          Search for grants
        </label>
        <div style={inputContainerStyle}>
          <div style={searchIconStyle}>
            <SearchIcon color="#14558F" />
          </div>
          <input
            id="grant-search-input"
            ref={ref}
            type="text"
            placeholder="Search by keyword, category, or describe what you need..."
            aria-label="Search grants by name, agency, or category"
            aria-describedby="search-help-text"
            aria-busy={isLoading || isSearching}
            role="searchbox"
            style={{
              ...inputStyle,
              cursor: disabled ? "not-allowed" : "text",
              opacity: disabled ? 0.7 : 1,
            }}
            value={searchTerm}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            disabled={disabled}
          />
          {searchTerm && !isLoading && !isSearching && (
            <button
              style={clearButtonStyle}
              onClick={onClear}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#333";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#666";
              }}
              aria-label="Clear search"
              type="button"
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
                  d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          )}
          {(isLoading || isSearching) && (
            <div
              style={{
                position: "absolute",
                right: "15px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Spinner
                animation="border"
                size="sm"
                variant="primary"
                role="status"
                aria-label="Searching"
              />
              {isSearching && (
                <span style={{ fontSize: "12px", color: "#14558F", whiteSpace: "nowrap" }}>
                  Searching...
                </span>
              )}
            </div>
          )}
        </div>
      </>
    );
  }
);

SearchInput.displayName = "SearchInput";

export default SearchInput;
