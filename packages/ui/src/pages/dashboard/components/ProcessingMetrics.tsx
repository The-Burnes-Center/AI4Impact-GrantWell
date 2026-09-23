import React from "react";
import type { IconType } from "react-icons";
import { LuCircleAlert, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { ProcessingMetrics as MetricsType } from "../../../common/types/processing-review";

interface ProcessingMetricsProps {
  metrics: MetricsType | null;
  loading: boolean;
}

type ScoreRating = "high" | "medium" | "low";

const RATING_ICONS: Record<ScoreRating, IconType> = {
  high: LuCircleCheck,
  medium: LuTriangleAlert,
  low: LuCircleAlert,
};

const getScoreRating = (value: number, highThreshold: number, medThreshold: number): ScoreRating => {
  if (value >= highThreshold) return "high";
  if (value >= medThreshold) return "medium";
  return "low";
};

const ScoreFlag: React.FC<{ rating: ScoreRating; label: string }> = ({ rating, label }) => {
  const Icon = RATING_ICONS[rating];
  return (
    <div className={`metric-card__flag review-quality-score--${rating}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
};

const RATING_LABELS: Record<ScoreRating, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const ProcessingMetrics: React.FC<ProcessingMetricsProps> = ({
  metrics,
  loading,
}) => {
  if (loading || !metrics) {
    return (
      <div className="metrics-grid" aria-busy="true">
        <span role="status" className="visually-hidden">Loading processing metrics</span>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="metric-card metric-card--skeleton" />
        ))}
      </div>
    );
  }

  const successRating = getScoreRating(metrics.successRate, 80, 50);

  return (
    <div className="metrics-grid" role="region" aria-label="Processing pipeline metrics">
      <div className="metric-card" aria-label={`Total Processed: ${metrics.totalProcessed}`}>
        <div className="metric-card__value">{metrics.totalProcessed}</div>
        <div className="metric-card__label">Total Processed</div>
      </div>
      <div
        className="metric-card"
        aria-label={`Success Rate: ${metrics.successRate}%, ${RATING_LABELS[successRating]}`}
      >
        <div className={`metric-card__value review-quality-score--${successRating}`}>
          {metrics.successRate}%
        </div>
        <div className="metric-card__label">Success Rate</div>
        <ScoreFlag rating={successRating} label={RATING_LABELS[successRating]} />
      </div>
      <div
        className="metric-card"
        aria-label={`Pending Review: ${metrics.pendingCount}${metrics.pendingCount > 0 ? ", needs review" : ""}`}
      >
        <div className={`metric-card__value ${metrics.pendingCount > 0 ? "review-quality-score--medium" : ""}`}>
          {metrics.pendingCount}
        </div>
        <div className="metric-card__label">Pending Review</div>
        {metrics.pendingCount > 0 && <ScoreFlag rating="medium" label="Needs review" />}
      </div>
      <div
        className="metric-card"
        aria-label={`Needs Re-upload: ${metrics.needsReuploadCount}${metrics.needsReuploadCount > 0 ? ", needs action" : ""}`}
      >
        <div className={`metric-card__value ${metrics.needsReuploadCount > 0 ? "review-quality-score--medium" : ""}`}>
          {metrics.needsReuploadCount}
        </div>
        <div className="metric-card__label">Needs Re-upload</div>
        {metrics.needsReuploadCount > 0 && <ScoreFlag rating="medium" label="Needs action" />}
      </div>
      <div
        className="metric-card"
        aria-label={`Failed: ${metrics.failedCount}${metrics.failedCount > 0 ? ", failures present" : ""}`}
      >
        <div className={`metric-card__value ${metrics.failedCount > 0 ? "review-quality-score--low" : ""}`}>
          {metrics.failedCount}
        </div>
        <div className="metric-card__label">Failed</div>
        {metrics.failedCount > 0 && <ScoreFlag rating="low" label="Failures" />}
      </div>
    </div>
  );
};

export default ProcessingMetrics;
