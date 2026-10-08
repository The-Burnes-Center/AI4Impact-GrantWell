/**
 * Shared UI Styles
 *
 * Centralized style constants for consistent theming across the application.
 * These values mirror the CSS custom properties in styles/tokens.css.
 * Use CSS variables (var(--gw-color-*)) in stylesheets; use these JS
 * exports only when inline styles are unavoidable (e.g., dynamic values).
 */

// Brand colors
export const colors = {
  // Primary (GrantWell Green)
  primary: "var(--gw-color-primary)",
  primaryHover: "var(--gw-color-primary-hover)",
  primaryActive: "var(--gw-color-primary-active)",
  primaryLight: "var(--gw-color-primary-light)",

  // Accent
  accent: "var(--gw-color-accent)",
  accentHover: "var(--gw-color-accent-hover)",

  // Status colors
  success: "#047857",
  successLight: "#d4edda",
  danger: "#CD0D0D",
  dangerLight: "#ffebee",
  error: "#CD0D0D",
  errorLight: "#ffebee",
  warning: "#F6B622",
  warningLight: "#fff3cd",

  // Focus
  focusLight: "var(--gw-color-primary)",
  focusDark: "var(--gw-color-primary-light)",

  // Neutral colors
  white: "#ffffff",
  background: "#f9fafb",
  border: "#e2e8f0",
  borderLight: "#f3f4f6",
  inputBorder: "#767676",
  text: "#333333",
  textSecondary: "#5a5a5a",
  textMuted: "#6b7280",
  heading: "var(--gw-color-primary-active)",

  // Disabled state
  disabledBg: "#F0F0F0",
  disabledText: "#707070",

  // Overlay
  overlay: "rgba(0, 0, 0, 0.6)",
};

// Typography
export const typography = {
  fontFamily: "'Noto Sans', sans-serif",
  fontSize: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

// Spacing
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "48px",
};

// Border radius
export const borderRadius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  full: "9999px",
};

// Shadows
export const shadows = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 1px 3px rgba(0, 0, 0, 0.1)",
  lg: "0 4px 6px rgba(0, 0, 0, 0.1)",
  xl: "0 10px 25px rgba(0, 0, 0, 0.2)",
};

// Transitions
export const transitions = {
  fast: "all 0.15s ease",
  normal: "all 0.2s ease",
  slow: "all 0.3s ease",
};

// Z-index layers
export const zIndex = {
  dropdown: 100,
  sticky: 200,
  modal: 1000,
  popover: 1100,
  tooltip: 1200,
};

// Button base styles
export const buttonStyles = {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    cursor: "pointer",
    transition: transitions.normal,
    border: "none",
  } as React.CSSProperties,

  sizes: {
    sm: {
      padding: `${spacing.sm} ${spacing.md}`,
      fontSize: typography.fontSize.sm,
      borderRadius: borderRadius.md,
    },
    md: {
      padding: `${spacing.md} ${spacing.xl}`,
      fontSize: typography.fontSize.base,
      borderRadius: borderRadius.md,
    },
    lg: {
      padding: `${spacing.lg} ${spacing["2xl"]}`,
      fontSize: typography.fontSize.lg,
      borderRadius: borderRadius.lg,
    },
  },

  variants: {
    primary: {
      backgroundColor: colors.primary,
      color: colors.white,
    },
    secondary: {
      backgroundColor: colors.white,
      color: colors.text,
      border: `1px solid ${colors.border}`,
    },
    danger: {
      backgroundColor: colors.danger,
      color: colors.white,
    },
    ghost: {
      backgroundColor: "transparent",
      color: colors.primary,
    },
  },
};
