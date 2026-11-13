import { Component, ErrorInfo, ReactNode } from "react";
import { Alert } from "react-bootstrap";

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

      // No role="alert" here: the react-bootstrap Alert below already carries one,
      // and nesting two makes a screen reader announce the failure twice.
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
            padding: "24px",
          }}
        >
          <Alert variant="danger" style={{ maxWidth: "600px", width: "100%" }}>
            <h1 className="alert-heading">Something went wrong</h1>
            <p>
              An unexpected error occurred. Please try refreshing the page. If
              the problem persists, contact support.
            </p>
            {this.state.error && (
              <p className="mb-3" style={{ fontSize: "14px", color: "var(--gw-color-text)" }}>
                {this.state.error.message}
              </p>
            )}
            <div className="d-flex gap-2">
              <button type="button" className="gw-btn gw-btn--danger" onClick={this.handleReset}>
                Try again
              </button>
              <button type="button" className="gw-btn gw-btn--secondary" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
