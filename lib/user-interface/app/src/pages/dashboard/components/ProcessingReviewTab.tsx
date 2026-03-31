import React, { useState, useEffect, useCallback } from "react";
import { LuChevronDown, LuFileX, LuRefreshCw, LuUpload } from "react-icons/lu";
import { ApiClient } from "../../../common/api-client/api-client";
import type {
  ReviewItem,
  ProcessingMetrics as MetricsType,
} from "../../../common/types/processing-review";
import ProcessingMetrics from "./ProcessingMetrics";
import ReviewExpandedRow from "./ReviewExpandedRow";

interface ProcessingReviewTabProps {
  apiClient: ApiClient;
  addNotification: (type: string, message: string) => void;
}

type StatusFilter = "all" | "pending_review" | "approved" | "rejected" | "failed" | "needs_reupload" | "superseded";

const STATUS_LABELS: Record<string, string> = {
  all: "All Statuses",
  pending_review: "Pending Review",
  needs_reupload: "Needs Re-upload",
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
};

const REPROCESSABLE_STATUSES = new Set(["failed", "pending_review", "needs_reupload"]);

const ProcessingReviewTab: React.FC<ProcessingReviewTabProps> = ({
  apiClient,
  addNotification,
}) => {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending_review");
  const [expandedNofo, setExpandedNofo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"reprocess" | "needs_reupload" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const status = statusFilter === "all" ? undefined : statusFilter;
      const items = await apiClient.landingPage.getProcessingReviews(status);
      setReviews(items);
    } catch {
      addNotification("error", "Failed to load processing reviews");
    } finally {
      setLoading(false);
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

  const handleActionComplete = () => {
    setExpandedNofo(null);
    setSelected(new Set());
    fetchData();
    fetchMetrics();
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
      addNotification("success", `Reprocessing triggered for ${succeeded} NOFO${succeeded === 1 ? "" : "s"}`);
    } else {
      addNotification("warning", `Reprocessed ${succeeded}, ${errored} failed to trigger`);
    }

    setBulkAction(null);
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
      addNotification("success", `${succeeded} NOFO${succeeded === 1 ? "" : "s"} marked as needs re-upload`);
    } else {
      addNotification("warning", `Marked ${succeeded}, ${errored} failed`);
    }

    setBulkAction(null);
    handleActionComplete();
  }, [selectedReviews, apiClient, addNotification]);

  const toggleExpand = (nofoName: string) => {
    setExpandedNofo((prev) => (prev === nofoName ? null : nofoName));
  };

  const getReasonSummary = (review: ReviewItem) => {
    if (review.missingSections && review.missingSections.length > 0) {
      return (
        <span className="review-issue-count review-issue-count--warning">
          Missing: {review.missingSections.join(", ")}
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
            Filter:
          </label>
          <div className="select-wrapper" style={{ minWidth: "160px" }}>
            <select
              id="review-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="form-input review-status-filter"
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="review-bulk-bar">
          <span className="review-bulk-bar__count">
            {selected.size} selected
          </span>
          <div className="review-bulk-bar__actions">
            <button
              className="review-btn review-btn--bulk-reprocess"
              onClick={() => void handleBulkReprocess()}
              disabled={!canReprocess || bulkAction !== null}
              aria-label={`Reprocess ${selected.size} selected NOFOs`}
            >
              <LuRefreshCw size={14} className={bulkAction === "reprocess" ? "refresh-icon" : ""} />
              <span>{bulkAction === "reprocess" ? "Reprocessing..." : "Reprocess Selected"}</span>
            </button>
            <button
              className="review-btn review-btn--needs-reupload"
              onClick={() => void handleBulkNeedsReupload()}
              disabled={!canMarkReupload || bulkAction !== null}
              aria-label={`Mark ${selected.size} selected NOFOs as needs re-upload`}
            >
              <LuUpload size={14} />
              <span>{bulkAction === "needs_reupload" ? "Marking..." : "Needs Re-upload"}</span>
            </button>
            <button
              className="review-bulk-bar__clear"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div className="table-container">
        <div className="table-header review-table-grid-select">
          <div className="header-cell review-checkbox-cell">
            <input
              type="checkbox"
              checked={reviews.length > 0 && selected.size === reviews.length}
              onChange={toggleSelectAll}
              aria-label="Select all reviews"
              disabled={reviews.length === 0}
            />
          </div>
          <div className="header-cell">NOFO Name</div>
          <div className="header-cell">Reason</div>
          <div className="header-cell">Status</div>
          <div className="header-cell">Date</div>
          <div className="header-cell">Details</div>
        </div>
        <div className="table-body" role="list" aria-label="Processing reviews">
          {loading ? (
            <div className="review-loading" aria-busy="true">
              Loading reviews...
            </div>
          ) : reviews.length === 0 ? (
            <div className="no-data">
              <LuFileX size={24} className="no-data-icon" />
              <p>
                {statusFilter === "pending_review"
                  ? "No NOFOs pending review"
                  : `No reviews with status "${STATUS_LABELS[statusFilter]}"`}
              </p>
            </div>
          ) : (
            reviews.map((review) => (
              <div key={`${review.nofo_name}-${review.review_id}`} role="listitem">
                <div
                  className={`table-row review-table-row review-table-grid-select ${expandedNofo === review.nofo_name ? "review-table-row--expanded" : ""} ${selected.has(review.review_id) ? "review-table-row--selected" : ""}`}
                  onClick={() => toggleExpand(review.nofo_name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(review.nofo_name);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={expandedNofo === review.nofo_name}
                  aria-label={`Review for ${review.nofo_name}`}
                >
                  <div
                    className="row-cell review-checkbox-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(review.review_id)}
                      onChange={() => toggleSelect(review.review_id)}
                      aria-label={`Select ${review.nofo_name}`}
                    />
                  </div>
                  <div className="row-cell">
                    <span className="review-nofo-name">
                      {review.nofo_name}
                    </span>
                  </div>
                  <div className="row-cell">{getReasonSummary(review)}</div>
                  <div className="row-cell">
                    <span className={`review-status-badge ${STATUS_CLASS_MAP[review.status] || "review-status-badge--pending"}`}>
                      {STATUS_LABELS[review.status] || review.status}
                    </span>
                  </div>
                  <div className="row-cell">
                    <span className="review-date">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="row-cell actions">
                    <span className="review-expand-toggle">
                      {expandedNofo === review.nofo_name ? "Hide" : "View"}
                      <LuChevronDown
                        size={14}
                        className={`review-chevron ${expandedNofo === review.nofo_name ? "review-chevron--expanded" : ""}`}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </div>

                {expandedNofo === review.nofo_name && (
                  <ReviewExpandedRow
                    review={review}
                    apiClient={apiClient}
                    onActionComplete={handleActionComplete}
                    addNotification={addNotification}
                    onCollapse={() => setExpandedNofo(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcessingReviewTab;
