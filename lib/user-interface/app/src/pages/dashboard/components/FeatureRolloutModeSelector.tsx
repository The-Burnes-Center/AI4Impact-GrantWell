import React from "react";
import type { FeatureRolloutMode } from "../../../common/types/feature-rollout";

interface FeatureRolloutModeSelectorProps {
  mode: FeatureRolloutMode;
  saving: boolean;
  onChange: (mode: FeatureRolloutMode) => void;
  renderOptionContent?: (mode: FeatureRolloutMode) => React.ReactNode;
}

const rolloutModeOptions: Array<{
  value: FeatureRolloutMode;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "Allow all users",
    description: "Everyone sees and can use AI search.",
  },
  {
    value: "allowlisted",
    label: "Allow allowlisted users only",
    description: "Only users in the allowlist can use AI search.",
  },
  {
    value: "disabled",
    label: "Disable for all users",
    description: "Nobody sees or can use AI search.",
  },
];

const FeatureRolloutModeSelector: React.FC<FeatureRolloutModeSelectorProps> = ({
  mode,
  saving,
  onChange,
  renderOptionContent,
}) => (
  <fieldset className="feature-rollouts-mode-group">
    <legend className="feature-rollouts-mode-legend">Rollout mode</legend>
    <div className="feature-rollouts-mode-options">
      {rolloutModeOptions.map((option) => (
        <div
          key={option.value}
          className={`feature-rollouts-mode-option ${mode === option.value ? "feature-rollouts-mode-option--selected" : ""}`}
        >
          <label className="feature-rollouts-mode-option-label">
            <input
              type="radio"
              name="ai-search-rollout-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onChange(option.value)}
              disabled={saving}
            />
            <span className="feature-rollouts-mode-copy">
              <span className="feature-rollouts-mode-label">{option.label}</span>
              <span className="feature-rollouts-mode-description">{option.description}</span>
            </span>
          </label>
          {mode === option.value ? renderOptionContent?.(option.value) ?? null : null}
        </div>
      ))}
    </div>
  </fieldset>
);

export default FeatureRolloutModeSelector;
