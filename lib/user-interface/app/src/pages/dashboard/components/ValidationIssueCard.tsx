import React from "react";
import { LuTriangleAlert, LuCircleAlert, LuInfo, LuWrench, LuCircleCheck } from "react-icons/lu";
import type { ValidationIssue } from "../../../common/types/processing-review";

interface ValidationIssueCardProps {
  issue: ValidationIssue;
  onApplyFix: (issue: ValidationIssue) => void;
  isFixed?: boolean;
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
}) => {
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = isFixed ? LuCircleCheck : config.icon;

  const cardClassName = [
    "validation-issue-card",
    isFixed ? "validation-issue-card--fixed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cardClassName}
      style={isFixed ? undefined : {
        border: `1px solid ${config.bgColor}40`,
        borderLeft: `4px solid ${config.bgColor}`,
        backgroundColor: `${config.bgColor}08`,
      }}
      role="alert"
      aria-label={`${config.label} issue: ${issue.description}${isFixed ? " (fixed)" : ""}`}
    >
      <div className="validation-issue-card__body">
        <Icon
          size={18}
          style={{
            color: isFixed ? "var(--mds-color-success)" : config.bgColor,
            marginTop: "2px",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              className="validation-issue-card__severity"
              style={{ color: isFixed ? "var(--mds-color-success)" : config.bgColor }}
            >
              {isFixed ? "Fixed" : config.label}
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
                {isFixed ? "Applied: " : "Suggested: "}{issue.suggestedFix}
              </span>
              {isFixed ? (
                <span className="validation-issue-card__fixed-badge" aria-label="Fix applied">
                  <LuCircleCheck size={12} aria-hidden="true" />
                  Applied
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
