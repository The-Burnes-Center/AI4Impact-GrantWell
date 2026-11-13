/**
 * Card Component
 * 
 * A reusable card container with optional header.
 * Provides consistent styling for content sections.
 * 
 * @example
 * // Basic card
 * <Card>
 *   <p>Card content here</p>
 * </Card>
 * 
 * // Card with header
 * <Card header="Settings">
 *   <p>Settings content</p>
 * </Card>
 * 
 * // Card with custom header actions
 * <Card
 *   header="Users"
 *   headerActions={<Button size="sm">Add user</Button>}
 * >
 *   <UserList />
 * </Card>
 */

import React from "react";
import { colors, typography, spacing, borderRadius, shadows } from "./styles";
import StepBand from "./StepBand";

export interface CardProps {
  /** Card title displayed in header */
  header?: string;
  /** Actions to display in header (buttons, etc.) */
  headerActions?: React.ReactNode;
  /** Whether to show the header background */
  headerStyle?: "default" | "primary" | "none";
  /** Card content */
  children: React.ReactNode;
  /** Additional container styles */
  style?: React.CSSProperties;
  /** Padding variant */
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "0",
  sm: spacing.lg,
  md: spacing["2xl"],
  lg: spacing["3xl"],
};

const Card: React.FC<CardProps> = ({
  header,
  headerActions,
  headerStyle = "primary",
  children,
  style,
  padding = "md",
}) => {
  const containerStyle: React.CSSProperties = {
    background: colors.white,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.md,
    overflow: "hidden",
    ...style,
  };

  const defaultHeaderStyle: React.CSSProperties = {
    background: colors.background,
    color: colors.text,
    padding: `${spacing.lg} ${spacing["2xl"]}`,
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const bodyStyle: React.CSSProperties = {
    padding: paddingMap[padding],
  };

  return (
    <div style={containerStyle}>
      {header && headerStyle === "primary" && <StepBand title={header} actions={headerActions} />}
      {header && headerStyle === "default" && (
        <div style={defaultHeaderStyle}>
          <h2
            style={{
              margin: 0,
              fontSize: typography.fontSize["2xl"],
              fontWeight: typography.fontWeight.semibold,
              fontFamily: typography.fontFamily,
            }}
          >
            {header}
          </h2>
          {headerActions && <div>{headerActions}</div>}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
};

export default Card;
