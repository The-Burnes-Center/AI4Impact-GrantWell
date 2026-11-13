import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProcessingMetrics from "./ProcessingMetrics";

describe("ProcessingMetrics", () => {
  it("mounts its loading status empty and fills it after, so the message is announced", async () => {
    render(<ProcessingMetrics metrics={null} loading />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    await waitFor(() => expect(region).toHaveTextContent("Loading processing metrics"));
    expect(region.closest('[aria-busy="true"]')).toBeNull();
  });
});
