import React, { useState, useEffect, useMemo } from "react";
import { LuFileX, LuX, LuArrowUp, LuArrowDown, LuArrowUpDown, LuPin } from "react-icons/lu";
import type { NOFO, GrantTypeId } from "../../common/types/nofo";
import { GRANT_TYPES } from "../../common/types/nofo";
import { Utils } from "../../common/utils";
import type { AISearchResult } from "../../hooks/use-ai-grant-search";
import "../../styles/landing-page-table.css";

type SortColumn = "name" | "agency" | "category" | "type" | "deadline";
type SortDirection = "asc" | "desc";

const SORT_COLUMN_LABELS: Record<SortColumn, string> = {
  name: "Name",
  agency: "Agency",
  category: "Category",
  type: "Type",
  deadline: "Deadline",
};

const NEW_GRANT_WINDOW_DAYS = 3;

const isRecentlyAdded = (createdAt?: string | null): boolean => {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= NEW_GRANT_WINDOW_DAYS;
};

interface GrantsTableProps {
  nofos: NOFO[];
  loading: boolean;
  onSelectDocument: (document: { label: string; value: string }) => void;
  onSearchTermChange?: (term: string) => void;
  searchTerm?: string;
  searchResults?: AISearchResult[] | null;
  isSearching?: boolean;
  isSearchPending?: boolean;
  searchError?: string | null;
  onClearSearch?: () => void;
  preferAISearch?: boolean;
}

export const GrantsTable: React.FC<GrantsTableProps> = ({
  nofos,
  loading,
  onSelectDocument,
  onSearchTermChange,
  searchTerm = "",
  searchResults = null,
  isSearching = false,
  isSearchPending = false,
  searchError = null,
  onClearSearch,
  preferAISearch = false,
}) => {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showAllAIResults, setShowAllAIResults] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const itemsPerPage = 10;
  const AI_INITIAL_LIMIT = 10;

  const uniqueCategories = Array.from(
    new Set(nofos.map((nofo) => nofo.category).filter((category): category is string => !!category))
  ).sort();

  const getCategoryCount = (category: string) => {
    return nofos.filter((nofo) => {
      return (
        nofo.category === category &&
        (statusFilter === "all" || nofo.status === statusFilter) &&
        (grantTypeFilter === "all" || nofo.grantType === grantTypeFilter)
      );
    }).length;
  };

  const getStatusCount = (status: "active" | "archived") => {
    return nofos.filter((nofo) => {
      return (
        nofo.status === status &&
        (categoryFilter === "all" || nofo.category === categoryFilter) &&
        (grantTypeFilter === "all" || nofo.grantType === grantTypeFilter)
      );
    }).length;
  };

  const getGrantTypeCount = (grantType: GrantTypeId) => {
    return nofos.filter((nofo) => {
      return (
        nofo.grantType === grantType &&
        (statusFilter === "all" || nofo.status === statusFilter) &&
        (categoryFilter === "all" || nofo.category === categoryFilter)
      );
    }).length;
  };

  const scoreMap = useMemo(() => {
    if (!searchResults) return null;
    const map = new Map<string, AISearchResult>();
    for (const r of searchResults) {
      map.set(r.name.toLowerCase().replace(/\/$/, ""), r);
    }
    return map;
  }, [searchResults]);

  const awaitingAIResults = isSearching || (isSearchPending && searchResults === null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortColumn(null);
      setSortDirection("asc");
    }
  };

  const resetSort = () => {
    setSortColumn(null);
    setSortDirection("asc");
  };

  const hasActiveFilters =
    statusFilter !== "all" || categoryFilter !== "all" || grantTypeFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setGrantTypeFilter("all");
  };

  const compareByColumn = (a: NOFO, b: NOFO, col: SortColumn, dir: SortDirection): number => {
    const mul = dir === "asc" ? 1 : -1;
    const stringCmp = (av: string | null | undefined, bv: string | null | undefined) => {
      // Missing values always sort last, regardless of direction
      const aEmpty = !av;
      const bEmpty = !bv;
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      return av!.localeCompare(bv!, undefined, { sensitivity: "base" }) * mul;
    };

    switch (col) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * mul;
      case "agency":
        return stringCmp(a.agency, b.agency);
      case "category":
        return stringCmp(a.category, b.category);
      case "type": {
        const aLabel = a.grantType ? GRANT_TYPES[a.grantType]?.label : null;
        const bLabel = b.grantType ? GRANT_TYPES[b.grantType]?.label : null;
        return stringCmp(aLabel, bLabel);
      }
      case "deadline": {
        // N/A always last; Rolling first when asc, last (before N/A) when desc
        const aNA = !a.isRolling && !a.expirationDate;
        const bNA = !b.isRolling && !b.expirationDate;
        if (aNA && bNA) return 0;
        if (aNA) return 1;
        if (bNA) return -1;
        if (a.isRolling && b.isRolling) return 0;
        if (a.isRolling) return dir === "asc" ? -1 : 1;
        if (b.isRolling) return dir === "asc" ? 1 : -1;
        return (new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime()) * mul;
      }
    }
  };

  const getFilteredNofos = () => {
    const searchLower = searchTerm.toLowerCase().trim();
    const hasRankedResults = scoreMap !== null && scoreMap.size > 0;

    let filtered = nofos.filter((nofo) => {
      const normalizedName = nofo.name.toLowerCase().replace(/\/$/, "");

      if (hasRankedResults) {
        if (!scoreMap.has(normalizedName)) return false;
      } else if (searchLower !== "" && !awaitingAIResults) {
        const tokens = searchLower.split(/\s+/).filter(Boolean);
        const searchableText = [
          nofo.name,
          nofo.agency,
          nofo.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = tokens.every((token) => searchableText.includes(token));
        if (!matchesSearch) return false;
      }

      const matchesStatus = statusFilter === "all" || nofo.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || nofo.category === categoryFilter;
      const matchesGrantType = grantTypeFilter === "all" || nofo.grantType === grantTypeFilter;

      return matchesStatus && matchesCategory && matchesGrantType;
    });

    if (sortColumn) {
      filtered.sort((a, b) => {
        // Keep pinned rows on top when browsing; AI-ranked mode ignores pinning
        if (!hasRankedResults) {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
        }
        return compareByColumn(a, b, sortColumn, sortDirection);
      });
    } else if (hasRankedResults) {
      filtered.sort((a, b) => {
        const scoreA = scoreMap.get(a.name.toLowerCase().replace(/\/$/, ""))?.score ?? 0;
        const scoreB = scoreMap.get(b.name.toLowerCase().replace(/\/$/, ""))?.score ?? 0;
        return scoreB - scoreA;
      });
    } else {
      filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }

    return filtered;
  };

  const filteredNofos = getFilteredNofos();

  const hasRankedResults = scoreMap !== null && scoreMap.size > 0;

  const totalPages = Math.ceil(filteredNofos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // For AI results: show top 10 initially, expand on "Show More".
  // For normal browsing: use existing pagination.
  const visibleNofos = hasRankedResults
    ? (showAllAIResults ? filteredNofos : filteredNofos.slice(0, AI_INITIAL_LIMIT))
    : filteredNofos.slice(startIndex, endIndex);

  // Reset dropdown filters, sort, and "show more" state when AI search returns results
  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      setStatusFilter("all");
      setCategoryFilter("all");
      setGrantTypeFilter("all");
      setShowAllAIResults(false);
      setSortColumn(null);
      setSortDirection("asc");
    }
  }, [searchResults]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, categoryFilter, grantTypeFilter, searchTerm, searchResults, preferAISearch, sortColumn, sortDirection]);

  const handleRowClick = (nofo: NOFO) => {
    onSelectDocument({
      label: nofo.name,
      value: nofo.name + "/",
    });
    onSearchTermChange?.(nofo.name);

    // Clear AI results so the table returns to normal browsing
    // (suppressSearchRef in IntegratedSearchBar prevents re-triggering)
    if (preferAISearch && searchResults) {
      onClearSearch?.();
    }

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 150);
  };

  if (loading) {
    return (
      <div className="landing-table-loading">
        <p>Loading grants...</p>
      </div>
    );
  }

  const getGrantTypeBadgeClassName = () => "landing-grant-type-badge";

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
            <option value="all">All Grants ({nofos.filter((nofo) =>
              (categoryFilter === "all" || nofo.category === categoryFilter) &&
              (grantTypeFilter === "all" || nofo.grantType === grantTypeFilter)
            ).length})</option>
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
            <option value="all">All Categories ({nofos.filter((nofo) =>
              (statusFilter === "all" || nofo.status === statusFilter) &&
              (grantTypeFilter === "all" || nofo.grantType === grantTypeFilter)
            ).length})</option>
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
            <option value="all">All Grant Types ({nofos.filter((nofo) =>
              (statusFilter === "all" || nofo.status === statusFilter) &&
              (categoryFilter === "all" || nofo.category === categoryFilter)
            ).length})</option>
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

        {hasActiveFilters && (
          <button
            type="button"
            className="landing-clear-filters-button"
            onClick={clearFilters}
            aria-label="Clear all filters"
          >
            <LuX size={14} aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>

      {/* Error banner */}
      {searchError && (
        <div className="search-status-banner search-status-banner--error" role="alert" aria-live="assertive">
          <span>Search failed: {searchError}</span>
          {onClearSearch && (
            <button className="search-clear-button" onClick={onClearSearch} aria-label="Dismiss error">
              <LuX size={16} />
            </button>
          )}
        </div>
      )}

      {/* Results summary */}
      {searchResults && !isSearching && !searchError && (
        <div className="search-status-banner" aria-live="polite">
          <span>
            Found <strong>{filteredNofos.length}</strong> grant{filteredNofos.length !== 1 ? "s" : ""} matching
            your search{!showAllAIResults && filteredNofos.length > AI_INITIAL_LIMIT
              ? ` (showing top ${AI_INITIAL_LIMIT})`
              : ""}
            {sortColumn && (
              <>
                {" · "}Sorted by {SORT_COLUMN_LABELS[sortColumn]}{" "}
                <button
                  type="button"
                  className="landing-sort-reset-link"
                  onClick={resetSort}
                >
                  back to relevance
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="landing-table-container" role="table" aria-label="Grants">
        <div className="landing-table-header" role="row">
          {(Object.keys(SORT_COLUMN_LABELS) as SortColumn[]).map((col) => {
            const isActive = sortColumn === col;
            const ariaSort = isActive ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
            const Icon = isActive ? (sortDirection === "asc" ? LuArrowUp : LuArrowDown) : LuArrowUpDown;
            return (
              <div key={col} role="columnheader" aria-sort={ariaSort} className="landing-header-cell-wrapper">
                <button
                  type="button"
                  className={`landing-header-cell landing-header-cell--sortable${isActive ? " landing-header-cell--active" : ""}`}
                  onClick={() => handleSort(col)}
                >
                  <span>{SORT_COLUMN_LABELS[col]}</span>
                  <Icon size={12} className="landing-header-sort-icon" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="landing-table-body" role={awaitingAIResults || visibleNofos.length === 0 ? undefined : "rowgroup"}>
          {awaitingAIResults ? (
            <div className="landing-search-loading" role="status" aria-busy="true" aria-label="Searching grants with AI">
              <div className="skeleton-row-group">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-row" aria-hidden="true">
                    <div className="skeleton-cell skeleton-cell--wide"><div className="skeleton-bar" /></div>
                    <div className="skeleton-cell"><div className="skeleton-bar" /></div>
                    <div className="skeleton-cell"><div className="skeleton-bar" /></div>
                    <div className="skeleton-cell skeleton-cell--narrow"><div className="skeleton-bar" /></div>
                    <div className="skeleton-cell skeleton-cell--narrow"><div className="skeleton-bar" /></div>
                  </div>
                ))}
              </div>
              <p className="search-loading-text">
                <span className="search-spinner" />
                Searching grants with AI&hellip;
              </p>
            </div>
          ) : filteredNofos.length === 0 ? (
            <div className="landing-no-data">
              <LuFileX size={24} className="landing-no-data-icon" />
              <p>
                {searchTerm
                  ? `No grants found matching "${searchTerm}"`
                  : "No grants found matching your filters"}
              </p>
            </div>
          ) : null}
          {!awaitingAIResults && visibleNofos.map((nofo) => {
            const isArchived = nofo.status === "archived";
            return (
              <div
                key={nofo.name}
                role="row"
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
                <div className="landing-row-cell" role="cell">
                  {nofo.isPinned && (
                    <LuPin
                      size={14}
                      className="landing-pinned-icon"
                      aria-label="Pinned grant"
                      title="Pinned — featured by an administrator"
                    />
                  )}
                  <span className="landing-nofo-name" style={{ color: isArchived ? "#888" : undefined }}>
                    {nofo.name}
                  </span>
                  {!isArchived && isRecentlyAdded(nofo.createdAt) && (
                    <span
                      className="landing-new-badge"
                      title={`Added within the last ${NEW_GRANT_WINDOW_DAYS} days`}
                    >
                      New
                    </span>
                  )}
                  {isArchived && (
                    <span
                      className="landing-expired-badge"
                      title="This grant has expired and is no longer accepting applications"
                    >
                      Expired
                    </span>
                  )}
                </div>
                <div className="landing-row-cell" role="cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.agency || <span className="landing-no-value">N/A</span>}
                </div>
                <div className="landing-row-cell" role="cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.category || <span className="landing-no-value">N/A</span>}
                </div>
                <div className="landing-row-cell" role="cell">
                  {nofo.grantType && GRANT_TYPES[nofo.grantType] ? (
                    <span
                      className={getGrantTypeBadgeClassName()}
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
                <div className="landing-row-cell" role="cell" style={{ color: isArchived ? "#888" : undefined }}>
                  {nofo.isRolling ? (
                    <span className="landing-expiry-date rolling">Rolling</span>
                  ) : nofo.expirationDate ? (
                    <span className="landing-expiry-date">
                      {Utils.formatExpirationDate(nofo.expirationDate)}
                    </span>
                  ) : (
                    <span className="landing-expiry-date landing-no-value">N/A</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Show More / Show Less for AI results */}
      {!awaitingAIResults && hasRankedResults && filteredNofos.length > AI_INITIAL_LIMIT && (
        <div className="landing-table-pagination" style={{ justifyContent: "center" }}>
          <button
            className="landing-show-more-button"
            onClick={() => setShowAllAIResults((prev) => !prev)}
            aria-label={showAllAIResults
              ? `Show top ${AI_INITIAL_LIMIT} results`
              : `Show all ${filteredNofos.length} results`}
          >
            {showAllAIResults
              ? "Show less"
              : `Show more (${filteredNofos.length - AI_INITIAL_LIMIT} more)`}
          </button>
        </div>
      )}

      {/* Pagination for normal browsing */}
      {!awaitingAIResults && !hasRankedResults && filteredNofos.length > 0 && totalPages > 1 && (
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
