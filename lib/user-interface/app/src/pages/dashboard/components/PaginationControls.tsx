import React from "react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

const PaginationControls: React.FC<PaginationControlsProps> = React.memo(({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}) => {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const pageButtons: React.ReactNode[] = [];

  pageButtons.push(
    <button
      key="prev"
      className="pagination-button"
      onClick={() => onPageChange(currentPage - 1)}
      disabled={currentPage === 1}
      aria-label="Previous page"
    >
      &lsaquo;
    </button>
  );

  const maxVisiblePages = 5;
  let startPage = Math.max(currentPage - Math.floor(maxVisiblePages / 2), 1);
  const endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(endPage - maxVisiblePages + 1, 1);
  }

  if (startPage > 1) {
    pageButtons.push(
      <button
        key="1"
        className={`pagination-button ${currentPage === 1 ? "active" : ""}`}
        onClick={() => onPageChange(1)}
      >
        1
      </button>
    );
    if (startPage > 2) {
      pageButtons.push(<span key="ellipsis1" className="pagination-ellipsis">...</span>);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pageButtons.push(
      <button
        key={i}
        className={`pagination-button ${currentPage === i ? "active" : ""}`}
        onClick={() => onPageChange(i)}
        aria-label={`Go to page ${i}`}
        aria-current={currentPage === i ? "page" : undefined}
      >
        {i}
      </button>
    );
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pageButtons.push(<span key="ellipsis2" className="pagination-ellipsis">...</span>);
    }
    pageButtons.push(
      <button
        key={totalPages}
        className={`pagination-button ${currentPage === totalPages ? "active" : ""}`}
        onClick={() => onPageChange(totalPages)}
      >
        {totalPages}
      </button>
    );
  }

  pageButtons.push(
    <button
      key="next"
      className="pagination-button"
      onClick={() => onPageChange(currentPage + 1)}
      disabled={currentPage === totalPages}
      aria-label="Next page"
    >
      &rsaquo;
    </button>
  );

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalItems} grants
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div className="pagination-controls">{pageButtons}</div>
        <div className="items-per-page">
          <label htmlFor="items-per-page-select" style={{ marginRight: "8px" }}>
            Show:
          </label>
          <select
            id="items-per-page-select"
            value={itemsPerPage}
            onChange={onItemsPerPageChange}
            aria-label="Items per page"
            className="form-input"
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>
    </div>
  );
});

PaginationControls.displayName = "PaginationControls";

export default PaginationControls;
