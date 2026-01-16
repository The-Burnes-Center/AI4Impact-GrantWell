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
  isAISearching: boolean;
  aiError: string | null;
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
      isAISearching,
      aiError,
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
            placeholder="Search grants or describe what you need..."
            aria-label="Search grants or describe what you need"
            aria-describedby={
              searchTerm.length === 0
                ? "search-help-know-grant search-help-not-sure"
                : aiError
                ? "ai-error-message search-results-status"
                : "search-results-status"
            }
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? "search-results-listbox" : undefined}
            aria-activedescendant={
              selectedIndex >= 0 && showResults
                ? `search-result-${selectedIndex}`
                : undefined
            }
            aria-busy={isLoading || isAISearching}
            aria-invalid={aiError ? "true" : "false"}
            aria-errormessage={aiError ? "ai-error-message" : undefined}
            role="combobox"
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
          {searchTerm && !isLoading && (
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
          {isLoading && (
            <div
              style={{
                position: "absolute",
                right: "15px",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <Spinner
                animation="border"
                size="sm"
                variant="primary"
                role="status"
                aria-label="Loading"
              />
            </div>
          )}
        </div>
      </>
    );
  }
);

SearchInput.displayName = "SearchInput";

export default SearchInput;
