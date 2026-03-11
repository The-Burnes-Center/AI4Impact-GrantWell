import React, { Component, ErrorInfo, ReactNode } from "react";
import { Alert, Button } from "react-bootstrap";

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
        <div
          role="alert"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
            padding: "24px",
          }}
        >
          <Alert variant="danger" style={{ maxWidth: "600px", width: "100%" }}>
            <Alert.Heading>Something went wrong</Alert.Heading>
            <p>
              An unexpected error occurred. Please try refreshing the page. If
              the problem persists, contact support.
            </p>
            {this.state.error && (
              <p className="mb-3" style={{ fontSize: "14px", color: "#666" }}>
                {this.state.error.message}
              </p>
            )}
            <div className="d-flex gap-2">
              <Button variant="outline-danger" onClick={this.handleReset}>
                Try Again
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
