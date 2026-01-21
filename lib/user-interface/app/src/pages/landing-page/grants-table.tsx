import React, { useState, useEffect, useRef } from "react";
import { LuFileX } from "react-icons/lu";
import { NOFO, GRANT_TYPES, GrantTypeId } from "../Dashboard";
import "../../styles/landing-page-table.css";

interface GrantsTableProps {
  nofos: NOFO[];
  loading: boolean;
  onSelectDocument: (document: { label: string; value: string }) => void;
  onSearchTermChange?: (term: string) => void;
}

export const GrantsTable: React.FC<GrantsTableProps> = ({ nofos, loading, onSelectDocument, onSearchTermChange }) => {
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");

  // Get unique agencies and categories for filters
  const uniqueAgencies = Array.from(
    new Set(nofos.map((nofo) => nofo.agency).filter((agency): agency is string => !!agency))
  ).sort();

  const uniqueCategories = Array.from(
    new Set(nofos.map((nofo) => nofo.category).filter((category): category is string => !!category))
  ).sort();

  // Filter NOFOs based on filters
  const getFilteredNofos = () => {
    let filtered = nofos.filter((nofo) => {
      // Agency filter
      const matchesAgency = agencyFilter === "all" || nofo.agency === agencyFilter;
      
      // Category filter
      const matchesCategory = categoryFilter === "all" || nofo.category === categoryFilter;
      
      // Grant type filter
      const matchesGrantType = grantTypeFilter === "all" || nofo.grantType === grantTypeFilter;

      return matchesAgency && matchesCategory && matchesGrantType;
    });

    // Sort: pinned first, then alphabetically
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return filtered;
  };

  const filteredNofos = getFilteredNofos();

  // Check if any filter is active (not "all")
  const hasActiveFilters = agencyFilter !== "all" || categoryFilter !== "all" || grantTypeFilter !== "all";

  // Handle row click to select document (same as search bar)
  const handleRowClick = (nofo: NOFO) => {
    const document = {
      label: nofo.name,
      value: nofo.name + "/",
    };
    
    // Update filters to match the selected grant
    if (nofo.agency) {
      setAgencyFilter(nofo.agency);
    }
    if (nofo.category) {
      setCategoryFilter(nofo.category);
    }
    if (nofo.grantType) {
      setGrantTypeFilter(nofo.grantType);
    }
    
    // Update the search bar with the grant name first (so dropdown recognizes it)
    if (onSearchTermChange) {
      onSearchTermChange(nofo.name);
    }
    
    // Then select the document (this will update the dropdown and show CTA buttons)
    onSelectDocument(document);
    
    // Scroll to top to show the CTA buttons
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="landing-table-loading">
        <p>Loading grants...</p>
      </div>
    );
  }

  return (
    <div className="landing-grants-table-container">
      {/* Filter Dropdowns */}
      <div className="landing-table-filters">
        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="agency-filter" className="landing-filter-label">Agency</label>
          <select
            id="agency-filter"
            className="landing-filter-dropdown"
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
          >
            <option value="all">Select Agency</option>
            {uniqueAgencies.map((agency) => (
              <option key={agency} value={agency}>
                {agency}
              </option>
            ))}
          </select>
        </div>

        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="category-filter" className="landing-filter-label">Category</label>
          <select
            id="category-filter"
            className="landing-filter-dropdown"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Select Category</option>
            {uniqueCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="landing-filter-dropdown-wrapper">
          <label htmlFor="grant-type-filter" className="landing-filter-label">Grant Type</label>
          <select
            id="grant-type-filter"
            className="landing-filter-dropdown"
            value={grantTypeFilter}
            onChange={(e) => setGrantTypeFilter(e.target.value as GrantTypeId | "all")}
          >
            <option value="all">Select Grant Type</option>
            {Object.keys(GRANT_TYPES).map((type) => (
              <option key={type} value={type}>
                {GRANT_TYPES[type as GrantTypeId].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {hasActiveFilters ? (
        <div className="landing-table-container">
          <div className="landing-table-header">
            <div className="landing-header-cell">Name</div>
            <div className="landing-header-cell">Agency</div>
            <div className="landing-header-cell">Category</div>
            <div className="landing-header-cell">Type</div>
            <div className="landing-header-cell">Expiry Date</div>
          </div>

          <div className="landing-table-body">
            {filteredNofos.length === 0 && (
              <div className="landing-no-data">
                <LuFileX size={24} className="landing-no-data-icon" />
                <p>No grants found matching your filters</p>
              </div>
            )}
            {filteredNofos.map((nofo, index) => (
            <div
              key={nofo.id || index}
              className="landing-table-row"
              onClick={() => handleRowClick(nofo)}
            >
              <div className="landing-row-cell">
                <span className="landing-nofo-name">{nofo.name}</span>
              </div>
              <div className="landing-row-cell">
                {nofo.agency || <span className="landing-no-value">N/A</span>}
              </div>
              <div className="landing-row-cell">
                {nofo.category || <span className="landing-no-value">N/A</span>}
              </div>
              <div className="landing-row-cell">
                {nofo.grantType && GRANT_TYPES[nofo.grantType] ? (
                  <span
                    className="landing-grant-type-badge"
                    style={{
                      backgroundColor: `${GRANT_TYPES[nofo.grantType].color}15`,
                      color: GRANT_TYPES[nofo.grantType].color,
                      borderColor: `${GRANT_TYPES[nofo.grantType].color}40`,
                    }}
                  >
                    {GRANT_TYPES[nofo.grantType].label}
                  </span>
                ) : (
                  <span className="landing-grant-type-badge unset">Unset</span>
                )}
              </div>
              <div className="landing-row-cell">
                {nofo.expirationDate ? (
                  <span className="landing-expiry-date">
                    {new Date(nofo.expirationDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : (
                  <span className="landing-expiry-date no-date">N/A</span>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div className="landing-table-empty-state">
          <p>Choose a filter above to view available grants</p>
        </div>
      )}
    </div>
  );
};
