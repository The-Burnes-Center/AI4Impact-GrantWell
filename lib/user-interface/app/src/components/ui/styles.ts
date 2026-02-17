/**
 * Shared UI Styles
 *
 * Centralized style constants for consistent theming across the application.
 * These values mirror the CSS custom properties in styles/tokens.css.
 * Use CSS variables (var(--mds-color-*)) in stylesheets; use these JS
 * exports only when inline styles are unavoidable (e.g., dynamic values).
 */

// Brand colors
export const colors = {
  // Primary brand colors (Bay Blue)
  primary: "#14558F",
  primaryHover: "#104472",
  primaryActive: "#0A2B48",
  primaryLight: "#f2f8fd",

  // Accent (Berkshires Green)
  accent: "#388557",
  accentHover: "#32784E",

  // Status colors
  success: "#24A850",
  successLight: "#d4edda",
  danger: "#CD0D0D",
  dangerLight: "#ffebee",
  error: "#CD0D0D",
  errorLight: "#ffebee",
  warning: "#F6B622",
  warningLight: "#fff3cd",
  info: "#17a2b8",
  infoLight: "#d1ecf1",

  // Focus
  focusLight: "#0088FF",
  focusDark: "#B2DBFF",

  // Neutral colors
  white: "#ffffff",
  background: "#f9fafb",
  backgroundAlt: "#f8f9fa",
  border: "#e2e8f0",
  borderLight: "#f3f4f6",
  text: "#333333",
  textSecondary: "#5a5a5a",
  textMuted: "#9ca3af",
  heading: "#0a2e52",

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
    outline: "none",
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

// Input base styles
export const inputStyles = {
  base: {
    width: "100%",
    padding: spacing.md,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize.base,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    outline: "none",
    transition: transitions.fast,
  } as React.CSSProperties,

  error: {
    borderColor: colors.danger,
  },

  focus: {
    borderColor: colors.primary,
    boxShadow: `0 0 0 3px ${colors.primaryLight}`,
  },
};

// Card base styles
export const cardStyles = {
  container: {
    background: colors.white,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.md,
    overflow: "hidden",
  } as React.CSSProperties,

  header: {
    background: colors.primary,
    color: colors.white,
    padding: `${spacing.xl} ${spacing["2xl"]}`,
  } as React.CSSProperties,

  body: {
    padding: spacing["2xl"],
  } as React.CSSProperties,
};
