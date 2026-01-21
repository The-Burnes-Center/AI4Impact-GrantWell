import React, { useState, useEffect } from "react";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 20;

  const uniqueCategories = Array.from(
    new Set(nofos.map((nofo) => nofo.category).filter((category): category is string => !!category))
  ).sort();

  // Calculate grant count per category
  const getCategoryCount = (category: string) => {
    return nofos.filter((nofo) => nofo.category === category).length;
  };

  // Calculate grant count per status
  const getStatusCount = (status: "active" | "archived") => {
    return nofos.filter((nofo) => nofo.status === status).length;
  };

  // Calculate grant count per grant type
  const getGrantTypeCount = (grantType: GrantTypeId) => {
    return nofos.filter((nofo) => nofo.grantType === grantType).length;
  };

  // Filter NOFOs based on filters
  const getFilteredNofos = () => {
    let filtered = nofos.filter((nofo) => {
      // Status filter
      const matchesStatus = statusFilter === "all" || nofo.status === statusFilter;
      
      // Category filter
      const matchesCategory = categoryFilter === "all" || nofo.category === categoryFilter;
      
      // Grant type filter
      const matchesGrantType = grantTypeFilter === "all" || nofo.grantType === grantTypeFilter;

      return matchesStatus && matchesCategory && matchesGrantType;
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
  
  // Pagination calculations
  const totalPages = Math.ceil(filteredNofos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedNofos = filteredNofos.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, grantTypeFilter]);

  // Handle row click to select document (same as search bar)
  const handleRowClick = (nofo: NOFO) => {
    const selectedDoc = {
      label: nofo.name,
      value: nofo.name + "/",
    };
    
    // Update filters to match the selected grant
    if (nofo.status) {
      setStatusFilter(nofo.status);
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
    onSelectDocument(selectedDoc);
    
    // Scroll to top to show the CTA buttons after state updates complete
    setTimeout(() => {
      // Try multiple scroll methods for cross-browser compatibility
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
      document.body.scrollTo({ top: 0, behavior: "smooth" });
    }, 150);
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
          <label htmlFor="status-filter" className="landing-filter-label">Status</label>
          <select
            id="status-filter"
            className="landing-filter-dropdown"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "archived")}
          >
            <option value="all">All Grants ({nofos.length})</option>
            <option value="active">Active ({getStatusCount("active")})</option>
            <option value="archived">Archived ({getStatusCount("archived")})</option>
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
            <option value="all">All Categories</option>
            {uniqueCategories.map((category) => {
              const count = getCategoryCount(category);
              return (
                <option key={category} value={category}>
                  {category} ({count})
                </option>
              );
            })}
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
            <option value="all">All Grant Types</option>
            {Object.keys(GRANT_TYPES).map((type) => {
              const grantType = type as GrantTypeId;
              const count = getGrantTypeCount(grantType);
              return (
                <option key={type} value={type}>
                  {GRANT_TYPES[grantType].label} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Table */}
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
          {paginatedNofos.map((nofo, index) => {
            const isArchived = nofo.status === "archived";
            return (
              <div
                key={nofo.id || index}
                className={`landing-table-row ${isArchived ? "archived" : ""}`}
                onClick={() => !isArchived && handleRowClick(nofo)}
                style={{
                  cursor: isArchived ? "not-allowed" : "pointer",
                  opacity: isArchived ? 0.7 : 1,
                  backgroundColor: isArchived ? "#f9f9f9" : undefined,
                }}
                aria-label={isArchived ? `${nofo.name} (Expired - no longer accepting applications)` : `Select ${nofo.name}`}
                aria-disabled={isArchived}
              >
                <div className="landing-row-cell">
                  <span className="landing-nofo-name" style={{ color: isArchived ? "#888" : undefined }}>
                    {nofo.name}
                  </span>
                  {isArchived && (
                    <span
                      className="landing-expired-badge"
                      title="This grant has expired and is no longer accepting applications"
                    >
                      Expired
                    </span>
                  )}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.agency || <span className="landing-no-value">N/A</span>}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
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
                        opacity: isArchived ? 0.6 : 1,
                      }}
                    >
                      {GRANT_TYPES[nofo.grantType].label}
                    </span>
                  ) : (
                    <span className="landing-grant-type-badge unset" style={{ opacity: isArchived ? 0.6 : 1 }}>Unset</span>
                  )}
                </div>
                <div className="landing-row-cell" style={{ color: isArchived ? "#888" : undefined }}>
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
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {filteredNofos.length > 0 && totalPages > 1 && (
        <div className="landing-table-pagination">
          <div className="landing-pagination-info">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredNofos.length)} of {filteredNofos.length} grants
          </div>
          <div className="landing-pagination-controls">
            <button
              className="landing-pagination-button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <div className="landing-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      className={`landing-pagination-page ${currentPage === page ? "active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Go to page ${page}`}
                      aria-current={currentPage === page ? "page" : undefined}
                    >
                      {page}
                    </button>
                  );
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <span key={page} className="landing-pagination-ellipsis">
                      ...
                    </span>
                  );
                }
                return null;
              })}
            </div>
            <button
              className="landing-pagination-button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
