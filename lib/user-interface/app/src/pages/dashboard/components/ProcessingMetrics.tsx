import React from "react";
import type { ProcessingMetrics as MetricsType } from "../../../common/types/processing-review";

interface ProcessingMetricsProps {
  metrics: MetricsType | null;
  loading: boolean;
}

const getScoreClass = (value: number, highThreshold: number, medThreshold: number): string => {
  if (value >= highThreshold) return "review-quality-score--high";
  if (value >= medThreshold) return "review-quality-score--medium";
  return "review-quality-score--low";
};

const ProcessingMetrics: React.FC<ProcessingMetricsProps> = ({
  metrics,
  loading,
}) => {
  if (loading || !metrics) {
    return (
      <div className="metrics-grid" aria-busy="true" aria-label="Loading processing metrics">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="metric-card metric-card--skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="metrics-grid" role="region" aria-label="Processing pipeline metrics">
      <div className="metric-card" role="status" aria-label={`Total Processed: ${metrics.totalProcessed}`}>
        <div className="metric-card__value">{metrics.totalProcessed}</div>
        <div className="metric-card__label">Total Processed</div>
      </div>
      <div className="metric-card" role="status" aria-label={`Success Rate: ${metrics.successRate}%`}>
        <div className={`metric-card__value ${getScoreClass(metrics.successRate, 80, 50)}`}>
          {metrics.successRate}%
        </div>
        <div className="metric-card__label">Success Rate</div>
      </div>
      <div className="metric-card" role="status" aria-label={`Avg Quality: ${metrics.avgQualityScore}/100`}>
        <div className="metric-card__value">{metrics.avgQualityScore}/100</div>
        <div className="metric-card__label">Avg Quality</div>
      </div>
      <div className="metric-card" role="status" aria-label={`Pending Review: ${metrics.pendingCount}`}>
        <div className={`metric-card__value ${metrics.pendingCount > 0 ? "review-quality-score--medium" : ""}`}>
          {metrics.pendingCount}
        </div>
        <div className="metric-card__label">Pending Review</div>
      </div>
      <div className="metric-card" role="status" aria-label={`Failed: ${metrics.failedCount}`}>
        <div className={`metric-card__value ${metrics.failedCount > 0 ? "review-quality-score--low" : ""}`}>
          {metrics.failedCount}
        </div>
        <div className="metric-card__label">Failed</div>
      </div>
    </div>
  );
};

export default ProcessingMetrics;
