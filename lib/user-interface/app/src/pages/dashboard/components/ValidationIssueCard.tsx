import React from "react";
import { LuTriangleAlert, LuCircleAlert, LuInfo, LuWrench, LuCircleCheck } from "react-icons/lu";
import type { ValidationIssue } from "../../../common/types/processing-review";

interface ValidationIssueCardProps {
  issue: ValidationIssue;
  onApplyFix: (issue: ValidationIssue) => void;
  isFixed?: boolean;
  isAcknowledged?: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: LuCircleAlert,
    label: "Critical",
    bgColor: "var(--mds-color-danger)",
  },
  warning: {
    icon: LuTriangleAlert,
    label: "Warning",
    bgColor: "var(--mds-color-warning)",
  },
  info: {
    icon: LuInfo,
    label: "Info",
    bgColor: "var(--mds-color-primary)",
  },
} as const;

const ValidationIssueCard: React.FC<ValidationIssueCardProps> = ({
  issue,
  onApplyFix,
  isFixed = false,
  isAcknowledged = false,
}) => {
  const config = SEVERITY_CONFIG[issue.severity];
  const resolved = isFixed || isAcknowledged;
  const Icon = resolved ? LuCircleCheck : config.icon;

  const cardClassName = [
    "validation-issue-card",
    resolved ? "validation-issue-card--fixed" : "",
  ].filter(Boolean).join(" ");

  const statusLabel = isFixed ? "Fixed" : isAcknowledged ? "Acknowledged" : config.label;
  const statusColor = resolved ? "var(--mds-color-success)" : config.bgColor;

  return (
    <div
      className={cardClassName}
      style={resolved ? undefined : {
        border: `1px solid ${config.bgColor}40`,
        borderLeft: `4px solid ${config.bgColor}`,
        backgroundColor: `${config.bgColor}08`,
      }}
      role="alert"
      aria-label={`${config.label} issue: ${issue.description}${resolved ? ` (${statusLabel.toLowerCase()})` : ""}`}
    >
      <div className="validation-issue-card__body">
        <Icon
          size={18}
          style={{
            color: statusColor,
            marginTop: "2px",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              className="validation-issue-card__severity"
              style={{ color: statusColor }}
            >
              {statusLabel}
            </span>
            <span className="validation-issue-card__field">
              {issue.field}
            </span>
          </div>
          <p className="validation-issue-card__description">
            {issue.description}
          </p>
          {issue.suggestedFix && (
            <div className="validation-issue-card__fix-row">
              <span className="validation-issue-card__suggestion">
                {isFixed ? "Applied: " : isAcknowledged ? "Noted: " : "Suggested: "}{issue.suggestedFix}
              </span>
              {resolved ? (
                <span className="validation-issue-card__fixed-badge" aria-label={`Fix ${statusLabel.toLowerCase()}`}>
                  <LuCircleCheck size={12} aria-hidden="true" />
                  {statusLabel}
                </span>
              ) : (
                <button
                  className="review-btn review-btn--apply-fix"
                  onClick={() => onApplyFix(issue)}
                  aria-label={`Apply fix for ${issue.field}: ${issue.suggestedFix}`}
                >
                  <LuWrench size={12} aria-hidden="true" />
                  Apply Fix
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationIssueCard;
