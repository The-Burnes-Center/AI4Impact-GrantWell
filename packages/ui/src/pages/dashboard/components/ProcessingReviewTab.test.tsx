import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "../../../common/types/processing-review";
import { json, stubFetch, type RouteRequest } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import ProcessingReviewTab from "./ProcessingReviewTab";

const REVIEWS = "GET /admin/processing-reviews";
const METRICS = "GET /admin/processing-metrics";
const CLOSE_EXPIRED = "POST /admin/processing-reviews/close-expired";

const review = (nofo_name: string, status: ReviewItem["status"], extra: Partial<ReviewItem> = {}): ReviewItem => ({
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
  deadline: null,
  daysLeft: null,
  deadlineUrgency: null,
  grantStatus: "active",
  ...extra,
});

// In the server's deadline order: soonest first, unknown next, expired last.
const QUEUE: ReviewItem[] = [
  review("Today Grant", "pending_review", { deadline: "2026-10-09", daysLeft: 0, deadlineUrgency: "due_soon", created_at: "2026-10-05T12:00:00Z" }),
  review("Soon Grant", "pending_review", { deadline: "2026-10-12", daysLeft: 3, deadlineUrgency: "due_soon", created_at: "2026-09-01T12:00:00Z" }),
  review("Month Grant", "failed", { deadline: "2026-10-30", daysLeft: 21, deadlineUrgency: "upcoming", created_at: "2026-10-07T12:00:00Z" }),
  review("Far Grant", "pending_review", { deadline: "2027-01-01", daysLeft: 84, deadlineUrgency: "later", created_at: "2026-09-15T12:00:00Z" }),
  review("Unknown Grant", "pending_review", { created_at: "2026-10-02T12:00:00Z" }),
  review("Expired Grant", "pending_review", { deadline: "2026-09-01", daysLeft: -38, deadlineUrgency: "expired", created_at: "2026-08-20T12:00:00Z" }),
];

const names = () => [...document.querySelectorAll(".review-nofo-name")].map((el) => el.textContent);
const deadlineCell = (name: string) => {
  const row = screen.getByText(name).closest('[role="row"]') as HTMLElement;
  return within(row).getAllByRole("cell")[4];
};

const metrics = {
  totalProcessed: 3, successRate: 33, pendingCount: 1, failedCount: 1, approvedCount: 1,
  rejectedCount: 0, needsReuploadCount: 0, supersededCount: 0,
};

const byStatus: Record<string, ReviewItem[]> = {
  pending_review: [review("Pending Grant", "pending_review")],
  failed: [review("Failed Grant", "failed")],
  all: [review("Pending Grant", "pending_review"), review("Failed Grant", "failed"), review("Approved Grant", "approved")],
};

function renderTab(
  reviews: Parameters<typeof stubFetch>[0][string] = (req: RouteRequest) =>
    json({ reviews: byStatus[req.url.searchParams.get("status") ?? "pending_review"] ?? [], expiredOpenCount: 0 }),
  closeExpired: Parameters<typeof stubFetch>[0][string] = json({ closed: 0 }),
) {
  const net = stubFetch({ [REVIEWS]: reviews, [METRICS]: json({ metrics }), [CLOSE_EXPIRED]: closeExpired });
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

  it("keeps the server's deadline order and labels deadlines with text, not just colour", async () => {
    renderTab(json({ reviews: QUEUE, expiredOpenCount: 1 }));
    await screen.findByText("Today Grant");

    expect(names()).toEqual(["Today Grant", "Soon Grant", "Month Grant", "Far Grant", "Unknown Grant", "Expired Grant"]);
    expect(within(deadlineCell("Today Grant")).getByText("Due today")).toHaveClass("review-deadline-badge--soon");
    expect(within(deadlineCell("Soon Grant")).getByText("Due in 3 days")).toHaveClass("review-deadline-badge--soon");
    expect(within(deadlineCell("Month Grant")).getByText("Due in 21 days")).toHaveClass("review-deadline-badge--upcoming");
    expect(within(deadlineCell("Expired Grant")).getByText("Expired")).toHaveClass("review-deadline-badge--expired");
    expect(deadlineCell("Far Grant")).toHaveTextContent(/^1\/1\/2027$/);
    expect(deadlineCell("Unknown Grant")).toHaveTextContent("No deadline");
    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("sorts by In queue since, oldest first then newest, and back to deadline order", async () => {
    const { user } = renderTab(json({ reviews: QUEUE, expiredOpenCount: 1 }));
    await screen.findByText("Today Grant");

    await user.click(screen.getByRole("button", { name: /In queue since/ }));
    expect(names()).toEqual(["Expired Grant", "Soon Grant", "Far Grant", "Unknown Grant", "Today Grant", "Month Grant"]);
    expect(screen.getByRole("columnheader", { name: /In queue since/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /Deadline/ })).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /In queue since/ }));
    expect(names()[0]).toBe("Month Grant");
    expect(screen.getByRole("columnheader", { name: /In queue since/ })).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: /^Deadline/ }));
    expect(names()).toEqual(QUEUE.map((r) => r.nofo_name));
  });

  it("disables Close all expired when no open review is for an expired grant", async () => {
    renderTab();
    await screen.findByText("Pending Grant");
    expect(screen.getByRole("button", { name: "Close all expired" })).toBeDisabled();
  });

  it("confirms with the exact count, closes, then reloads the queue and metrics", async () => {
    let expired = 12;
    const { net, user, addNotification } = renderTab(
      () => json({ reviews: QUEUE, expiredOpenCount: expired }),
      () => {
        expired = 0;
        return json({ closed: 12 });
      },
    );
    await screen.findByText("Today Grant");
    const button = screen.getByRole("button", { name: "Close all expired" });
    expect(button).toHaveAccessibleDescription("12 open reviews are for expired grants.");

    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Close reviews for expired grants" });
    expect(within(dialog).getByText("Close 12 reviews for expired grants? The grants themselves aren't changed.")).toBeInTheDocument();
    const reviewLoads = net.to(REVIEWS).length;
    const metricLoads = net.to(METRICS).length;

    await user.click(within(dialog).getByRole("button", { name: "Close 12 reviews" }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith("success", "Closed 12 reviews for expired grants"));
    expect(net.to(CLOSE_EXPIRED)).toHaveLength(1);
    await waitFor(() => expect(net.to(REVIEWS).length).toBeGreaterThan(reviewLoads));
    expect(net.to(METRICS).length).toBeGreaterThan(metricLoads);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close all expired" })).toBeDisabled());
  });

  it("closes nothing when the confirmation is cancelled", async () => {
    const { net, user } = renderTab(json({ reviews: QUEUE, expiredOpenCount: 1 }));
    await screen.findByText("Today Grant");
    await user.click(screen.getByRole("button", { name: "Close all expired" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Close 1 review for an expired grant? The grant itself isn't changed.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(net.to(CLOSE_EXPIRED)).toHaveLength(0);
  });
});
