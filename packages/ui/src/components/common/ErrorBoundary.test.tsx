import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("names the fallback screen with an h1", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quiet = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", quiet);
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    } finally {
      window.removeEventListener("error", quiet);
    }
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("kaboom");
  });
});
