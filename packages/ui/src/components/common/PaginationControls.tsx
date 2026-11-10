import React, { useId } from "react";

interface PaginationControlsBaseProps {
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** Leave out to hide the page-size picker. */
  onItemsPerPageChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  itemsPerPageOptions?: number[];
  itemLabel?: string;
  selectId?: string;
  /** Announce the "Showing x to y" range when it changes (for lists that page in place). */
  live?: boolean;
}

interface NumberedPaginationControlsProps extends PaginationControlsBaseProps {
  mode?: "numbered";
  totalPages: number;
  totalItems: number;
}

interface TokenPaginationControlsProps extends PaginationControlsBaseProps {
  mode: "token";
  pageItemCount: number;
  hasNextPage: boolean;
}

type PaginationControlsProps =
  | NumberedPaginationControlsProps
  | TokenPaginationControlsProps;

/** Pages to show: the first, the last, and the current page with two on each side; null marks a gap. */
export function visiblePages(current: number, total: number): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let page = 1; page <= total; page++) {
    if (page === 1 || page === total || Math.abs(page - current) <= 2) pages.push(page);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  return pages;
}

const PaginationControls: React.FC<PaginationControlsProps> = React.memo(({
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [5, 10, 25, 50],
  itemLabel = "grants",
  selectId,
  live = false,
  ...paginationProps
}) => {
  const generatedSelectId = useId();
  const itemsPerPageSelectId = selectId ?? generatedSelectId;
  const isTokenMode = paginationProps.mode === "token";
  const totalItems = isTokenMode ? paginationProps.pageItemCount : paginationProps.totalItems;
  const totalPages = isTokenMode
    ? Math.max(currentPage + (paginationProps.hasNextPage ? 1 : 0), currentPage)
    : paginationProps.totalPages;

  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = isTokenMode
    ? (currentPage - 1) * itemsPerPage + totalItems
    : Math.min(currentPage * itemsPerPage, totalItems);

  // aria-disabled, not disabled: reaching the first or last page must not drop focus to <body>.
  const prevDisabled = currentPage === 1;
  const nextDisabled = isTokenMode ? !paginationProps.hasNextPage : currentPage >= totalPages;

  return (
    <nav className="gw-pagination pagination-container" aria-label="Pagination">
      <div className="gw-pagination__info pagination-info" role={live ? "status" : undefined}>
        {isTokenMode
          ? `Showing ${startItem} to ${endItem} ${itemLabel} on page ${currentPage}`
          : `Showing ${startItem} to ${endItem} of ${totalItems} ${itemLabel}`}
      </div>
      <div className="gw-pagination__controls">
        <div className="gw-pagination__pages pagination-controls">
          <button
            type="button"
            className="gw-pagination__step"
            onClick={() => !prevDisabled && onPageChange(currentPage - 1)}
            aria-disabled={prevDisabled}
            aria-label="Previous page"
          >
            <span aria-hidden="true">‹</span> Previous
          </button>
          {!isTokenMode &&
            visiblePages(currentPage, totalPages).map((page, i) =>
              page === null ? (
                <span key={`gap-${i}`} className="gw-pagination__gap" aria-hidden="true">…</span>
              ) : (
                <button
                  type="button"
                  key={page}
                  className="gw-pagination__page"
                  onClick={() => onPageChange(page)}
                  aria-label={`Go to page ${page}`}
                  aria-current={currentPage === page ? "page" : undefined}
                >
                  {page}
                </button>
              )
            )}
          <button
            type="button"
            className="gw-pagination__step"
            onClick={() => !nextDisabled && onPageChange(currentPage + 1)}
            aria-disabled={nextDisabled}
            aria-label="Next page"
          >
            Next <span aria-hidden="true">›</span>
          </button>
        </div>
        {onItemsPerPageChange && (
          <div className="gw-pagination__size items-per-page">
            <label htmlFor={itemsPerPageSelectId}>Items per page:</label>
            <select
              id={itemsPerPageSelectId}
              value={itemsPerPage}
              onChange={onItemsPerPageChange}
              className="gw-input form-input"
            >
              {itemsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </nav>
  );
});

PaginationControls.displayName = "PaginationControls";

export default PaginationControls;
