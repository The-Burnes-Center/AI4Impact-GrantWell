import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "../../../common/types/processing-review";
import { json, stubFetch, type RouteRequest } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import ProcessingReviewTab from "./ProcessingReviewTab";

const REVIEWS = "GET /admin/processing-reviews";
const METRICS = "GET /admin/processing-metrics";

const review = (nofo_name: string, status: ReviewItem["status"]): ReviewItem => ({
  nofo_name,
  review_id: `${nofo_name}-r`,
  status,
  created_at: "2026-10-01T12:00:00Z",
  retryCount: 0,
  source: "pipeline",
  errorMessage: null,
  guidanceTitle: null,
  guidanceSeverity: null,
  missingSections: [],
});

const metrics = {
  totalProcessed: 3, successRate: 33, pendingCount: 1, failedCount: 1, approvedCount: 1,
  rejectedCount: 0, needsReuploadCount: 0, supersededCount: 0,
};

const byStatus: Record<string, ReviewItem[]> = {
  pending_review: [review("Pending Grant", "pending_review")],
  failed: [review("Failed Grant", "failed")],
  all: [review("Pending Grant", "pending_review"), review("Failed Grant", "failed"), review("Approved Grant", "approved")],
};

function renderTab(reviews: Parameters<typeof stubFetch>[0][string] = (req: RouteRequest) =>
  json({ reviews: byStatus[req.url.searchParams.get("status") ?? "pending_review"] ?? [] })) {
  const net = stubFetch({ [REVIEWS]: reviews, [METRICS]: json({ metrics }) });
  const addNotification = vi.fn();
  const view = renderApp(<ProcessingReviewTab apiClient={testApiClient()} addNotification={addNotification} />);
  return { net, addNotification, ...view };
}

describe("ProcessingReviewTab", () => {
  it("opens on Pending Review and asks the server for that status", async () => {
    const { net } = renderTab();
    expect(await screen.findByText("Pending Grant")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter:")).toHaveValue("pending_review");
    expect(net.to(REVIEWS)[0].url.searchParams.get("status")).toBe("pending_review");
  });

  it("sends status=all for All Statuses, so the server doesn't fall back to pending", async () => {
    const { net, user } = renderTab();
    await screen.findByText("Pending Grant");

    await user.selectOptions(screen.getByLabelText("Filter:"), "all");
    expect(await screen.findByText("Approved Grant")).toBeInTheDocument();
    expect(screen.getByText("Failed Grant")).toBeInTheDocument();
    expect(net.last(REVIEWS).url.searchParams.get("status")).toBe("all");
  });

  it("names the filter when a status has no reviews", async () => {
    const { user } = renderTab();
    await screen.findByText("Pending Grant");
    await user.selectOptions(screen.getByLabelText("Filter:"), "rejected");
    expect(await screen.findByText('No reviews with status "Rejected"')).toBeInTheDocument();
  });

  it("raises an error notification when the queue fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { addNotification } = renderTab(json({ message: "boom" }, 500));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith("error", "Failed to load processing reviews"));
  });
});
