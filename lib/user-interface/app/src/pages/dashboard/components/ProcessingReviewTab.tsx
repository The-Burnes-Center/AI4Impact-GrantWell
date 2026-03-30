import React, { useState, useEffect, useCallback } from "react";
import { LuCircleAlert, LuTriangleAlert, LuChevronDown, LuFileX } from "react-icons/lu";
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

type StatusFilter = "all" | "pending_review" | "approved" | "rejected" | "failed";

const STATUS_LABELS: Record<string, string> = {
  all: "All Statuses",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

const STATUS_CLASS_MAP: Record<string, string> = {
  pending_review: "review-status-badge--pending",
  approved: "review-status-badge--approved",
  rejected: "review-status-badge--rejected",
  failed: "review-status-badge--failed",
};

const SOURCE_LABELS: Record<string, string> = {
  dlq: "DLQ failure",
  duplicate: "Duplicate detected",
  quality: "Quality check failed",
};

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

  // so this single effect handles both initial load and filter changes.
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Metrics only need to load once on mount
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleActionComplete = () => {
    setExpandedNofo(null);
    fetchData();
    fetchMetrics();
  };

  const toggleExpand = (nofoName: string) => {
    setExpandedNofo((prev) => (prev === nofoName ? null : nofoName));
  };

  const getReasonSummary = (review: ReviewItem) => {
    if (review.missingSections && review.missingSections.length > 0) {
      return (
        <span className="review-issue-count review-issue-count--warning">
          <LuTriangleAlert size={12} aria-hidden="true" />
          Missing: {review.missingSections.join(", ")}
        </span>
      );
    }

    const sourceLabel = SOURCE_LABELS[review.source];
    if (sourceLabel) {
      return (
        <span className="review-issue-count review-issue-count--critical">
          <LuCircleAlert size={12} aria-hidden="true" />
          {sourceLabel}
        </span>
      );
    }

    if (review.errorMessage) {
      return (
        <span className="review-issue-count review-issue-count--warning">
          <LuTriangleAlert size={12} aria-hidden="true" />
          Processing error
        </span>
      );
    }

    return (
      <span style={{ fontSize: "12px", color: "var(--mds-color-text-secondary)" }}>
        No issues
      </span>
    );
  };

  return (
    <div className="tab-content">
      <ProcessingMetrics metrics={metrics} loading={metricsLoading} />

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <label
          htmlFor="review-status-filter"
          style={{ fontSize: "13px", fontWeight: 500, color: "var(--mds-color-text-secondary)" }}
        >
          Filter:
        </label>
        <div className="select-wrapper" style={{ minWidth: "160px" }}>
          <select
            id="review-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="form-input review-status-filter"
            style={{ fontSize: "13px", padding: "6px 12px" }}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header" style={{ gridTemplateColumns: "1fr 200px 120px 80px" }}>
          <div className="header-cell">NOFO Name</div>
          <div className="header-cell">Reason</div>
          <div className="header-cell">Status</div>
          <div className="header-cell">Actions</div>
        </div>
        <div className="table-body" role="list" aria-label="Processing reviews">
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--mds-color-text-secondary)" }} aria-busy="true">
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
                  className={`table-row review-table-row ${expandedNofo === review.nofo_name ? "review-table-row--expanded" : ""}`}
                  style={{ gridTemplateColumns: "1fr 200px 120px 80px" }}
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
                  <div className="row-cell">
                    <span className="nofo-name" style={{ fontSize: "13px" }}>
                      {review.nofo_name}
                    </span>
                  </div>
                  <div className="row-cell">{getReasonSummary(review)}</div>
                  <div className="row-cell">
                    <span className={`review-status-badge ${STATUS_CLASS_MAP[review.status] || "review-status-badge--pending"}`}>
                      {STATUS_LABELS[review.status] || review.status}
                    </span>
                  </div>
                  <div className="row-cell actions">
                    <LuChevronDown
                      size={16}
                      style={{
                        transform: expandedNofo === review.nofo_name ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                        color: "var(--mds-color-text-secondary)",
                      }}
                      aria-hidden="true"
                    />
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
