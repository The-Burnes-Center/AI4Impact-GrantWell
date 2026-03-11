import React from "react";
import type { FeatureRolloutMode } from "../../../common/types/feature-rollout";

interface FeatureRolloutOverviewProps {
  mode: FeatureRolloutMode;
  allowlistedCount: number;
  updatedAtLabel: string;
  updatedByLabel: string | null;
}

const modeSummary: Record<
  FeatureRolloutMode,
  { label: string; detail: string; badgeClass: string }
> = {
  all: {
    label: "Live for everyone",
    detail: "All users see AI search on the landing page.",
    badgeClass: "feature-rollouts-badge--success",
  },
  allowlisted: {
    label: "Targeted rollout",
    detail: "Only allowlisted users see AI search.",
    badgeClass: "feature-rollouts-badge--warning",
  },
  disabled: {
    label: "Classic search only",
    detail: "AI search is hidden and the landing page stays in standard mode.",
    badgeClass: "feature-rollouts-badge--neutral",
  },
};

const FeatureRolloutOverview: React.FC<FeatureRolloutOverviewProps> = ({
  mode,
  allowlistedCount,
  updatedAtLabel,
  updatedByLabel,
}) => {
  const summary = modeSummary[mode];

  return (
    <section className="feature-rollouts-overview" aria-label="AI search rollout summary">
      <article className="feature-rollouts-overview-card">
        <span className={`feature-rollouts-badge ${summary.badgeClass}`}>Current state</span>
        <h3>{summary.label}</h3>
        <p>{summary.detail}</p>
      </article>

      <article className="feature-rollouts-overview-card">
        <span className="feature-rollouts-badge feature-rollouts-badge--info">Allowlist</span>
        <h3>{allowlistedCount} user{allowlistedCount === 1 ? "" : "s"}</h3>
        <p>
          Stored entries stay ready for targeted rollout even when the feature is disabled.
        </p>
      </article>

      <article className="feature-rollouts-overview-card">
        <span className="feature-rollouts-badge feature-rollouts-badge--neutral">Audit</span>
        <h3>Last updated {updatedAtLabel}</h3>
        <p>{updatedByLabel ? `Changed by ${updatedByLabel}.` : "No changes recorded yet."}</p>
      </article>
    </section>
  );
};

export default FeatureRolloutOverview;
