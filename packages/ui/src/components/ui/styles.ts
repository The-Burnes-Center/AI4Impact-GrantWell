/**
 * Shared UI Styles
 *
 * Colors and shadows resolve to the theme tokens in styles/tokens.css, so each
 * deployment's palette applies. Prefer the CSS classes; use these only for
 * inline styles.
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
  success: "var(--gw-color-success)",
  successLight: "var(--gw-color-success-light)",
  danger: "var(--gw-color-danger)",
  dangerLight: "var(--gw-color-danger-light)",
  error: "var(--gw-color-danger-text)",
  errorLight: "var(--gw-color-danger-light)",
  warning: "var(--gw-color-warning)",
  warningLight: "var(--gw-color-warning-light)",

  // Focus
  focusLight: "var(--gw-color-focus)",
  focusDark: "var(--gw-color-focus-on-dark)",

  // Neutral colors
  white: "var(--gw-color-surface)",
  textInverse: "var(--gw-color-text-inverse)",
  background: "var(--gw-color-background)",
  border: "var(--gw-color-border)",
  borderLight: "var(--gw-color-surface-subtle)",
  inputBorder: "var(--gw-color-border-input)",
  text: "var(--gw-color-text)",
  textSecondary: "var(--gw-color-text-secondary)",
  textMuted: "var(--gw-color-text-muted)",
  heading: "var(--gw-color-heading)",

  // Disabled state
  disabledBg: "var(--gw-color-disabled-bg)",
  disabledText: "var(--gw-color-disabled-text)",

  // Overlay
  overlay: "var(--gw-color-overlay)",
};

// Typography
export const typography = {
  fontFamily: "var(--gw-font-family)",
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
  sm: "var(--gw-shadow-sm)",
  md: "var(--gw-shadow-md)",
  lg: "var(--gw-shadow-lg)",
  xl: "var(--gw-shadow-xl)",
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

