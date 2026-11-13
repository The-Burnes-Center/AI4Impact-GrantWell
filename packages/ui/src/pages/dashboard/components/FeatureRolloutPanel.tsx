import React from "react";

interface FeatureRolloutPanelProps {
  title: string;
  description: string;
  overview: React.ReactNode;
  controls: React.ReactNode;
  footer?: React.ReactNode;
}

const FeatureRolloutPanel: React.FC<FeatureRolloutPanelProps> = ({
  title,
  description,
  overview,
  controls,
  footer,
}) => (
  <div className="feature-rollouts-card">
    <div className="feature-rollouts-card__header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>

    {overview}
    {controls}
    {footer ? <div className="feature-rollouts-meta">{footer}</div> : null}
  </div>
);

export default FeatureRolloutPanel;
