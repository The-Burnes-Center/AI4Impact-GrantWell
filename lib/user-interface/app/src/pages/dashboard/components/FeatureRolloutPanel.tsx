import React from "react";

interface FeatureRolloutPanelProps {
  eyebrow: string;
  title: string;
  description: string;
  overview: React.ReactNode;
  controls: React.ReactNode;
  footer?: React.ReactNode;
}

const FeatureRolloutPanel: React.FC<FeatureRolloutPanelProps> = ({
  eyebrow,
  title,
  description,
  overview,
  controls,
  footer,
}) => (
  <div className="feature-rollouts-card">
    <div className="feature-rollouts-card__header">
      <div>
        <span className="feature-rollouts-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>

    {overview}
    {controls}
    {footer ? <div className="feature-rollouts-meta">{footer}</div> : null}
  </div>
);

export default FeatureRolloutPanel;
