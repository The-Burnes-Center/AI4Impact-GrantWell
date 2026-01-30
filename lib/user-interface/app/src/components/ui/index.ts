/**
 * UI Components Library
 * 
 * Centralized exports for all shared UI components.
 * Import from this file for cleaner imports:
 * 
 * @example
 * import { Button, Card, LoadingSpinner } from '../components/ui';
 */

// Core Components
export { default as Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { default as Card } from "./Card";
export type { CardProps } from "./Card";

export { default as LoadingSpinner } from "./LoadingSpinner";
export type { LoadingSpinnerProps, SpinnerSize } from "./LoadingSpinner";

// Form Components
export { default as FormField } from "./FormField";
export type { FormFieldProps } from "./FormField";

export { default as FormErrorSummary } from "./FormErrorSummary";
export type { FormErrorSummaryProps } from "./FormErrorSummary";

export { default as AutoSaveIndicator } from "./AutoSaveIndicator";
export type { AutoSaveIndicatorProps, SaveStatus } from "./AutoSaveIndicator";

// Navigation Components
export { default as NavigationButtons } from "./NavigationButtons";
export type { NavigationButtonsProps } from "./NavigationButtons";

// Style Constants
export * from "./styles";
