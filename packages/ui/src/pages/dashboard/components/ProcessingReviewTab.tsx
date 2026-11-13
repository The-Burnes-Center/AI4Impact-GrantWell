import React, { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LuArchiveX, LuChevronDown, LuFileX, LuRefreshCw, LuUpload } from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import type {
  ReviewItem,
  ProcessingMetrics as MetricsType,
} from "../../../common/types/processing-review";
import ProcessingMetrics from "./ProcessingMetrics";
import ReviewExpandedRow from "./ReviewExpandedRow";
import TableScrollRegion from "../../../components/ui/TableScrollRegion";
import SortableHeader from "../../../components/ui/SortableHeader";
import { Modal } from "../../../components/common/Modal";
import { sectionLabel } from "./section-labels";

interface ProcessingReviewTabProps {
  apiClient: ApiClient;
  addNotification: (type: string, message: string) => void;
  /** When set, open the queue with this NOFO's row expanded (deep-link from Grants). */
  focusNofo?: string | null;
}

type StatusFilter = "all" | "pending_review" | "approved" | "rejected" | "failed" | "needs_reupload" | "superseded";

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  pending_review: "Pending review",
  needs_reupload: "Needs re-upload",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  superseded: "Superseded",
};

const STATUS_CLASS_MAP: Record<string, string> = {
  pending_review: "review-status-badge--pending",
  approved: "review-status-badge--approved",
  rejected: "review-status-badge--rejected",
  failed: "review-status-badge--failed",
  needs_reupload: "review-status-badge--needs-reupload",
  superseded: "review-status-badge--superseded",
};

const SOURCE_LABELS: Record<string, string> = {
  pipeline: "Pipeline",
  dlq: "DLQ failure",
  "scraper-dlq": "Scraper failure",
  duplicate: "Duplicate detected",
  quality: "Quality check",
  verification: "Live grant check",
};

const REPROCESSABLE_STATUSES = new Set(["failed", "pending_review", "needs_reupload"]);

/** Checkbox, name, reason, status, deadline, in queue since, details — the expanded row spans all of them. */
const TABLE_COLUMN_COUNT = 7;

type SortOrder = { key: "deadline" } | { key: "queued"; oldestFirst: boolean };

function deadlineBadge(review: ReviewItem): { label: string; className: string } | null {
  const { daysLeft, deadlineUrgency } = review;
  if (deadlineUrgency === "expired") return { label: "Expired", className: "review-deadline-badge--expired" };
  if ((deadlineUrgency !== "due_soon" && deadlineUrgency !== "upcoming") || daysLeft == null) return null;
  const label = daysLeft === 0 ? "Due today" : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  return { label, className: `review-deadline-badge--${deadlineUrgency === "due_soon" ? "soon" : "upcoming"}` };
}

const formatDeadline = (deadline: string) =>
  new Date(`${deadline}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" });

const ProcessingReviewTab: React.FC<ProcessingReviewTabProps> = ({
  apiClient,
  addNotification,
  focusNofo,
}) => {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending_review");
  const [expandedNofo, setExpandedNofo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"reprocess" | "needs_reupload" | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>({ key: "deadline" });
  const [expiredOpenCount, setExpiredOpenCount] = useState(0);
  const [confirmCloseExpired, setConfirmCloseExpired] = useState(false);
  const [closingExpired, setClosingExpired] = useState(false);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");
  const hasLoaded = useRef(false);

  const tableRef = useRef<HTMLTableElement>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  // A resolved review can leave the list on reload; then focus falls back to the table.
  const refocusAfterReload = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Without a status the server answers with pending reviews only.
      const list = await apiClient.landingPage.getProcessingReviews(statusFilter);
      setReviews(list.reviews);
      setExpiredOpenCount(list.expiredOpenCount);
      if (hasLoaded.current) {
        const n = list.reviews.length;
        setResultsAnnouncement(`${n} review${n === 1 ? "" : "s"} shown`);
      }
    } catch {
      addNotification("error", "Failed to load processing reviews");
    } finally {
      setLoading(false);
      setLoaded(true);
      hasLoaded.current = true;
    }
  }, [apiClient, statusFilter, addNotification]);

  const fetchMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      const m = await apiClient.landingPage.getProcessingMetrics();
      setMetrics(m);
    } catch {
      // Metrics are non-critical
    } finally {
      setMetricsLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Clear selection when filter changes
  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter]);

  useEffect(() => {
    if (!focusNofo) return;
    setStatusFilter("all");
    setExpandedNofo(focusNofo);
  }, [focusNofo]);

  useEffect(() => {
    if (!refocusAfterReload.current || loading) return;
    refocusAfterReload.current = false;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || (active as HTMLButtonElement).disabled) tableRef.current?.focus();
  }, [loading, reviews]);

  const focusSelectAll = () => {
    const selectAll = selectAllRef.current;
    (selectAll && !selectAll.disabled ? selectAll : tableRef.current)?.focus();
  };

  const collapse = (nofoName: string) => {
    toggleRefs.current.get(nofoName)?.focus();
    setExpandedNofo(null);
  };

  const handleActionComplete = (nofoName?: string) => {
    if (nofoName) toggleRefs.current.get(nofoName)?.focus();
    refocusAfterReload.current = true;
    setExpandedNofo(null);
    setSelected(new Set());
    fetchData();
    fetchMetrics();
  };

  // The server already sends deadline order.
  const sortedReviews = useMemo(() => {
    if (sortOrder.key === "deadline") return reviews;
    const direction = sortOrder.oldestFirst ? 1 : -1;
    return [...reviews].sort((a, b) => direction * a.created_at.localeCompare(b.created_at));
  }, [reviews, sortOrder]);

  const sortByQueued = () =>
    setSortOrder((prev) => ({ key: "queued", oldestFirst: prev.key === "queued" ? !prev.oldestFirst : true }));

  const handleCloseExpired = async () => {
    setClosingExpired(true);
    try {
      const { closed } = await apiClient.landingPage.closeExpiredReviews();
      addNotification("success", closed === 1 ? "Closed 1 review for an expired grant" : `Closed ${closed} reviews for expired grants`);
    } catch {
      addNotification("error", "Couldn't close the reviews for expired grants. Try again.");
    } finally {
      setClosingExpired(false);
      setConfirmCloseExpired(false);
      handleActionComplete();
    }
  };

  const toggleSelect = (reviewId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === reviews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(reviews.map((r) => r.review_id)));
    }
  };

  const selectedReviews = reviews.filter((r) => selected.has(r.review_id));
  const canReprocess = selectedReviews.some((r) => REPROCESSABLE_STATUSES.has(r.status));

  const handleBulkReprocess = useCallback(async () => {
    const toReprocess = selectedReviews.filter((r) => REPROCESSABLE_STATUSES.has(r.status));
    if (toReprocess.length === 0) return;

    setBulkAction("reprocess");
    let succeeded = 0;
    let errored = 0;

    for (const item of toReprocess) {
      try {
        await apiClient.landingPage.reprocessNofo(item.nofo_name);
        succeeded++;
      } catch {
        errored++;
      }
    }

    if (errored === 0) {
      addNotification("success", `Reprocessing triggered for ${succeeded} grant${succeeded === 1 ? "" : "s"}`);
    } else {
      addNotification("warning", `Reprocessed ${succeeded}, ${errored} failed to trigger`);
    }

    setBulkAction(null);
    focusSelectAll();
    handleActionComplete();
  }, [selectedReviews, apiClient, addNotification]);

  const canMarkReupload = selectedReviews.some((r) => r.status === "pending_review" || r.status === "failed");

  const handleBulkNeedsReupload = useCallback(async () => {
    const eligible = selectedReviews.filter((r) => r.status === "pending_review" || r.status === "failed");
    if (eligible.length === 0) return;

    setBulkAction("needs_reupload");
    let succeeded = 0;
    let errored = 0;

    for (const item of eligible) {
      try {
        await apiClient.landingPage.markNeedsReupload(item.nofo_name, "Marked via bulk action", item.review_id);
        succeeded++;
      } catch {
        errored++;
      }
    }

    if (errored === 0) {
      addNotification("success", `${succeeded} grant${succeeded === 1 ? "" : "s"} marked as needs re-upload`);
    } else {
      addNotification("warning", `Marked ${succeeded}, ${errored} failed`);
    }

    setBulkAction(null);
    focusSelectAll();
    handleActionComplete();
  }, [selectedReviews, apiClient, addNotification]);

  const toggleExpand = (nofoName: string) => {
    setExpandedNofo((prev) => (prev === nofoName ? null : nofoName));
  };

  const getReasonSummary = (review: ReviewItem) => {
    if (review.unverifiedCount) {
      return (
        <span className="review-issue-count review-issue-count--critical">
          Not confirmed: {review.unverifiedCount} {review.unverifiedCount === 1 ? "requirement" : "requirements"}
        </span>
      );
    }

    if (review.missingSections && review.missingSections.length > 0) {
      return (
        <span className="review-issue-count review-issue-count--warning">
          Missing: {review.missingSections.map(sectionLabel).join(", ")}
        </span>
      );
    }

    const sourceLabel = SOURCE_LABELS[review.source];
    if (sourceLabel) {
      return (
        <span className="review-issue-count review-issue-count--critical">
          {sourceLabel}
        </span>
      );
    }

    if (review.errorMessage) {
      return (
        <span className="review-issue-count review-issue-count--warning">
          Processing error
        </span>
      );
    }

    return (
      <span className="review-no-issues">
        No issues
      </span>
    );
  };

  return (
    <div className="tab-content">
      <ProcessingMetrics metrics={metrics} loading={metricsLoading} />

      <div className="review-filter-bar">
        <div className="review-filter-group">
          <label
            htmlFor="review-status-filter"
            className="review-filter-label"
          >
            Filter by status
          </label>
          <div className="select-wrapper" style={{ minWidth: "160px" }}>
            <select
              id="review-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="gw-input form-input review-status-filter"
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="gw-btn gw-btn--secondary review-btn review-btn--close-expired"
          onClick={() => setConfirmCloseExpired(true)}
          disabled={expiredOpenCount === 0 || closingExpired}
          aria-describedby="close-expired-hint"
        >
          <LuArchiveX size={14} aria-hidden="true" />
          <span>Close all expired</span>
        </button>
        <span id="close-expired-hint" className="visually-hidden">
          {expiredOpenCount === 0
            ? "No open reviews are for expired grants."
            : expiredOpenCount === 1
              ? "1 open review is for an expired grant."
              : `${expiredOpenCount} open reviews are for expired grants.`}
        </span>
      </div>

      <Modal
        isOpen={confirmCloseExpired}
        onClose={() => !closingExpired && setConfirmCloseExpired(false)}
        title="Close reviews for expired grants"
      >
        <div className="modal-form">
          <p>
            {expiredOpenCount === 1
              ? "Close 1 review for an expired grant? The grant itself isn't changed."
              : `Close ${expiredOpenCount} reviews for expired grants? The grants themselves aren't changed.`}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="gw-btn gw-btn--secondary modal-button secondary"
              onClick={() => !closingExpired && setConfirmCloseExpired(false)}
              aria-disabled={closingExpired || undefined}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gw-btn gw-btn--primary modal-button primary"
              onClick={() => !closingExpired && void handleCloseExpired()}
              aria-disabled={closingExpired || undefined}
            >
              {closingExpired ? "Closing..." : `Close ${expiredOpenCount} review${expiredOpenCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </Modal>

      <div role="status" className="visually-hidden">
        {bulkAction === "reprocess"
          ? `Reprocessing ${selected.size} grant${selected.size === 1 ? "" : "s"}`
          : bulkAction === "needs_reupload"
            ? `Marking ${selected.size} grant${selected.size === 1 ? "" : "s"} as needs re-upload`
            : selected.size > 0
              ? `${selected.size} selected`
              : ""}
      </div>
      {selected.size > 0 && (
        <div className="review-bulk-bar">
          <span className="review-bulk-bar__count">
            {selected.size} selected
          </span>
          <div className="review-bulk-bar__actions">
            <button
              className="gw-btn gw-btn--primary review-btn review-btn--bulk-reprocess"
              onClick={() => canReprocess && bulkAction === null && void handleBulkReprocess()}
              aria-disabled={!canReprocess || bulkAction !== null || undefined}
              aria-label={`${bulkAction === "reprocess" ? "Reprocessing..." : "Reprocess selected"} — ${selected.size} grant${selected.size === 1 ? "" : "s"}`}
            >
              <LuRefreshCw size={14} className={bulkAction === "reprocess" ? "refresh-icon" : ""} aria-hidden="true" />
              <span>{bulkAction === "reprocess" ? "Reprocessing..." : "Reprocess selected"}</span>
            </button>
            <button
              className="gw-btn gw-btn--secondary review-btn review-btn--needs-reupload"
              onClick={() => canMarkReupload && bulkAction === null && void handleBulkNeedsReupload()}
              aria-disabled={!canMarkReupload || bulkAction !== null || undefined}
              aria-label={`${bulkAction === "needs_reupload" ? "Marking..." : "Needs re-upload"} — mark ${selected.size} selected grant${selected.size === 1 ? "" : "s"} as needs re-upload`}
            >
              <LuUpload size={14} aria-hidden="true" />
              <span>{bulkAction === "needs_reupload" ? "Marking..." : "Needs re-upload"}</span>
            </button>
            <button
              className="review-bulk-bar__clear"
              onClick={() => {
                focusSelectAll();
                setSelected(new Set());
              }}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <TableScrollRegion label="Processing reviews table" minWidth={960} className="table-scroll review-table-scroll">
      <div className="table-container">
        <table className="gw-table" aria-label="Processing reviews" ref={tableRef} tabIndex={-1} aria-busy={loading}>
          <colgroup>
            <col style={{ width: 104 }} />
            <col />
            <col style={{ width: "16%" }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 88 }} />
          </colgroup>
          <thead>
            <tr>
              <td className="header-cell review-checkbox-cell">
                <label className="gw-select-all">
                  <input
                    type="checkbox"
                    ref={(el) => {
                      selectAllRef.current = el;
                      if (el) el.indeterminate = selected.size > 0 && selected.size < reviews.length;
                    }}
                    checked={reviews.length > 0 && selected.size === reviews.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all reviews"
                    disabled={reviews.length === 0}
                  />
                  <span aria-hidden="true">Select all</span>
                </label>
              </td>
              <th scope="col" className="header-cell">Grant name</th>
              <th scope="col" className="header-cell">Reason</th>
              <th scope="col" className="header-cell">Status</th>
              <SortableHeader
                label="Deadline"
                direction={sortOrder.key === "deadline" ? "ascending" : null}
                onSort={() => setSortOrder({ key: "deadline" })}
              />
              <SortableHeader
                label="In queue since"
                direction={sortOrder.key === "queued" ? (sortOrder.oldestFirst ? "ascending" : "descending") : null}
                onSort={sortByQueued}
              />
              <th scope="col" className="header-cell review-details-cell">Details</th>
            </tr>
          </thead>
          {loaded && (
            <tbody>
              {reviews.length === 0 ? (
                <tr>
                  <td className="row-cell row-cell--empty" colSpan={TABLE_COLUMN_COUNT}>
                    <div className="no-data">
                      <LuFileX size={24} className="no-data-icon" aria-hidden="true" />
                      <p>
                        {statusFilter === "pending_review"
                          ? "No grants pending review"
                          : `No reviews with status "${STATUS_LABELS[statusFilter]}"`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedReviews.map((review) => {
                  const badge = deadlineBadge(review);
                  return (
                    <Fragment key={`${review.nofo_name}-${review.review_id}`}>
                      <tr
                        className={`table-row review-table-row ${expandedNofo === review.nofo_name ? "review-table-row--expanded" : ""} ${selected.has(review.review_id) ? "review-table-row--selected" : ""}`}
                      >
                        <td className="row-cell review-checkbox-cell">
                          <input
                            type="checkbox"
                            checked={selected.has(review.review_id)}
                            onChange={() => toggleSelect(review.review_id)}
                            aria-label={`Select ${review.nofo_name}`}
                          />
                        </td>
                        <td className="row-cell">
                          <span className="review-nofo-name">
                            {review.nofo_name}
                          </span>
                        </td>
                        <td className="row-cell">{getReasonSummary(review)}</td>
                        <td className="row-cell">
                          <span className={`gw-tag review-status-badge ${STATUS_CLASS_MAP[review.status] || "review-status-badge--pending"}`}>
                            {STATUS_LABELS[review.status] || review.status}
                          </span>
                        </td>
                        <td className="row-cell">
                          <div className="review-deadline-cell">
                            <span className="review-date">
                              {review.deadline ? formatDeadline(review.deadline) : "No deadline"}
                            </span>
                            {badge && <span className={`gw-tag review-deadline-badge ${badge.className}`}>{badge.label}</span>}
                          </div>
                        </td>
                        <td className="row-cell">
                          <span className="review-date">
                            {new Date(review.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
                          </span>
                        </td>
                        <td className="row-cell review-details-cell">
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) toggleRefs.current.set(review.nofo_name, el);
                              else toggleRefs.current.delete(review.nofo_name);
                            }}
                            className="review-expand-toggle"
                            onClick={() => toggleExpand(review.nofo_name)}
                            aria-expanded={expandedNofo === review.nofo_name}
                            aria-label={`${expandedNofo === review.nofo_name ? "Hide" : "View"} details for ${review.nofo_name}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, font: "inherit", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            {expandedNofo === review.nofo_name ? "Hide" : "View"}
                            <LuChevronDown
                              size={14}
                              className={`review-chevron ${expandedNofo === review.nofo_name ? "review-chevron--expanded" : ""}`}
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      </tr>

                      {expandedNofo === review.nofo_name && (
                        <ReviewExpandedRow
                          review={review}
                          apiClient={apiClient}
                          onActionComplete={() => handleActionComplete(review.nofo_name)}
                          addNotification={addNotification}
                          onCollapse={() => collapse(review.nofo_name)}
                          colSpan={TABLE_COLUMN_COUNT}
                        />
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          )}
        </table>
        {loading && (
          <div className="review-loading" aria-hidden="true">
            Loading reviews...
          </div>
        )}
        <div role="status" className="visually-hidden">
          {loading ? "Loading reviews" : resultsAnnouncement}
        </div>
      </div>
      </TableScrollRegion>
    </div>
  );
};

export default ProcessingReviewTab;
