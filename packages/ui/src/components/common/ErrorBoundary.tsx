import { Component, ErrorInfo, ReactNode } from "react";
import PageMessage from "./PageMessage";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If omitted, a default error alert is shown. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and renders a fallback UI instead of crashing.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <PageMessage
          alert
          title="Something went wrong"
          message="This page hit an unexpected error. Try again, and if it keeps happening, reload the page."
          action={{ label: "Try again", onClick: this.handleReset }}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
