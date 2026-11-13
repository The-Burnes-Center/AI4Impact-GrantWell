import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewDetail, ReviewItem } from "../../../common/types/processing-review";
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
  const row = screen.getByText(name).closest("tr") as HTMLElement;
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
    expect(screen.getByLabelText("Filter by status")).toHaveValue("pending_review");
    expect(net.to(REVIEWS)[0].url.searchParams.get("status")).toBe("pending_review");
  });

  it("sends status=all for All Statuses, so the server doesn't fall back to pending", async () => {
    const { net, user } = renderTab();
    await screen.findByText("Pending Grant");

    await user.selectOptions(screen.getByLabelText("Filter by status"), "all");
    expect(await screen.findByText("Approved Grant")).toBeInTheDocument();
    expect(screen.getByText("Failed Grant")).toBeInTheDocument();
    expect(net.last(REVIEWS).url.searchParams.get("status")).toBe("all");
  });

  it("names the filter when a status has no reviews", async () => {
    const { user } = renderTab();
    await screen.findByText("Pending Grant");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "rejected");
    expect(await screen.findByText('No reviews with status "Rejected"')).toBeInTheDocument();
    expect(screen.getByText("0 reviews shown")).toHaveAttribute("role", "status");
  });

  it("names missing sections in words, not raw keys", async () => {
    renderTab(json({ reviews: [review("Gap Grant", "pending_review", { missingSections: ["ProjectNarrativeSections", "RequiredDocuments", "EligibilityCriteria", "KeyDeadlines"] })], expiredOpenCount: 0 }));
    expect(await screen.findByText("Missing: narrative sections, required documents, eligibility criteria, key deadlines")).toBeInTheDocument();
  });

  it("splits an unknown section key into words, keeping acronyms", async () => {
    renderTab(json({ reviews: [review("Odd Grant", "pending_review", { missingSections: ["FundingRestrictions", "SAMRegistration"] })], expiredOpenCount: 0 }));
    expect(await screen.findByText("Missing: funding restrictions, SAM registration")).toBeInTheDocument();
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

  it("reports a partial selection as mixed on the select-all checkbox", async () => {
    const { user } = renderTab(json({ reviews: QUEUE, expiredOpenCount: 1 }));
    await screen.findByText("Today Grant");
    const selectAll = screen.getByRole("checkbox", { name: "Select all reviews" }) as HTMLInputElement;
    expect(selectAll.closest("th")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Select Soon Grant" }));
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll).not.toBeChecked();

    await user.click(selectAll);
    expect(selectAll.indeterminate).toBe(false);
    expect(selectAll).toBeChecked();
  });

  it("announces the selection count from a status region that is already in the page", async () => {
    const { user } = renderTab(json({ reviews: QUEUE, expiredOpenCount: 1 }));
    await screen.findByText("Today Grant");
    const before = screen.getAllByRole("status");

    await user.click(screen.getByRole("checkbox", { name: "Select Soon Grant" }));
    const region = screen.getAllByRole("status").find((el) => el.textContent === "1 selected");
    expect(before).toContain(region);
    await user.click(screen.getByRole("checkbox", { name: "Select Far Grant" }));
    expect(region).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(region).toBeEmptyDOMElement();
  });

  it("announces a bulk reprocess in the selection status region while it runs", async () => {
    let release!: () => void;
    const net = stubFetch({
      [REVIEWS]: json({ reviews: QUEUE, expiredOpenCount: 1 }),
      [METRICS]: json({ metrics }),
      "POST /admin/reprocess-nofo": () =>
        new Promise<Response>((resolve) => { release = () => resolve(json({ message: "ok" })); }),
    });
    const { user } = renderApp(<ProcessingReviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    await screen.findByText("Today Grant");
    await user.click(screen.getByRole("checkbox", { name: "Select Soon Grant" }));
    const region = screen.getAllByRole("status").find((el) => el.textContent === "1 selected")!;

    await user.click(screen.getByRole("button", { name: /^Reprocess selected — / }));
    expect(region).toHaveTextContent("Reprocessing 1 grant");
    release();
    await waitFor(() => expect(region).toBeEmptyDOMElement());
    expect(net.to("POST /admin/reprocess-nofo")).toHaveLength(1);
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

describe("requirements the grant doesn't support", () => {
  const held = review("Held-Grant", "pending_review", {
    source: "verification",
    unverifiedCount: 2,
    guidanceTitle: "Some requirements could not be confirmed in the grant",
    guidanceSeverity: "critical",
  });
  const detail: ReviewDetail = {
    ...held,
    extractedSummary: { EligibilityCriteria: [{ item: "Tribes", description: "Tribal governments may apply." }] },
    extractedQuestions: null,
    validationResult: { overallVerdict: "NEEDS_REVIEW" },
    s3DocumentKey: "",
    s3RawTextKey: "",
    documentTextPreview: "",
    reviewed_by: null,
    reviewed_at: null,
    admin_notes: null,
    corrections: null,
    adminGuidance: {
      reason: "unverified_items",
      severity: "critical",
      title: "Some requirements could not be confirmed in the grant",
      message: '"Held-Grant" was live and has been unpublished until it is reviewed.',
      actions: ["Check each item listed below against the grant document."],
      missingCategories: [],
      canApprove: true,
      failingItems: [
        { category: "EligibilityCriteria", label: "Eligibility criteria", item: "Tribes", reason: "No passage in the grant states this." },
        { category: "application_deadline", label: "Application deadline", item: "2027-04-01", reason: "The date 2027-04-01 does not appear in the grant." },
      ],
    },
  };

  it("counts them in the queue and names each one with its reason in the review", async () => {
    stubFetch({
      [REVIEWS]: json({ reviews: [held], expiredOpenCount: 0 }),
      [METRICS]: json({ metrics }),
      "GET /admin/processing-reviews/Held-Grant": json({ review: detail }),
    });
    const { user } = renderApp(<ProcessingReviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    await screen.findByText("Held-Grant");
    expect(screen.getByText("Not confirmed: 2 requirements")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details for Held-Grant" }));

    const heading = await screen.findByText("Requirements not confirmed in the grant:");
    const items = within(heading.parentElement as HTMLElement).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Eligibility criteria: “Tribes” — No passage in the grant states this.",
      "Application deadline: “2027-04-01” — The date 2027-04-01 does not appear in the grant.",
    ]);
  });

  const openDetail = async (item: ReviewItem, shown: ReviewDetail, routes: Parameters<typeof stubFetch>[0] = {}) => {
    const net = stubFetch({
      [REVIEWS]: json({ reviews: [item], expiredOpenCount: 0 }),
      [METRICS]: json({ metrics }),
      [`GET /admin/processing-reviews/${item.nofo_name}`]: json({ review: shown }),
      ...routes,
    });
    const view = renderApp(<ProcessingReviewTab apiClient={testApiClient()} addNotification={vi.fn()} />);
    await view.user.click(await screen.findByRole("button", { name: `View details for ${item.nofo_name}` }));
    await screen.findByText("Requirements not confirmed in the grant:");
    return { ...view, net };
  };

  it.each([
    ["a live grant", held, detail],
    ["a new grant", { ...held, nofo_name: "New-Grant", source: "pipeline" as const }, { ...detail, nofo_name: "New-Grant", source: "pipeline" as const }],
  ])("recommends Approve for %s", async (_label, item, shown) => {
    await openDetail(item, shown);
    expect(screen.getByRole("button", { name: /^Approve as is .*\(recommended\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reprocess — / })).not.toHaveAccessibleName(/recommended/);
  });

  it("warns that rejecting a grant that was live deletes it for everyone", async () => {
    const { user } = await openDetail(held, detail);
    await user.type(screen.getByRole("textbox", { name: /Admin notes/ }), "Not a real grant");
    await user.click(screen.getByRole("button", { name: /^Reject — / }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm reject" });
    expect(within(dialog).getByText("This grant was live. Rejecting deletes it and its files for everyone.")).toBeInTheDocument();
  });

  it("keeps the usual reject confirmation for a new grant", async () => {
    const { user } = await openDetail(
      { ...held, nofo_name: "New-Grant", source: "pipeline" },
      { ...detail, nofo_name: "New-Grant", source: "pipeline" }
    );
    await user.type(screen.getByRole("textbox", { name: /Admin notes/ }), "Duplicate");
    await user.click(screen.getByRole("button", { name: /^Reject — / }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm reject" });
    expect(within(dialog).queryByText(/This grant was live/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/permanently delete the grant document/)).toBeInTheDocument();
  });

  const rejectDialog = async (item: ReviewItem, shown: ReviewDetail, routes: Parameters<typeof stubFetch>[0] = {}) => {
    const view = await openDetail(item, shown, routes);
    await view.user.type(screen.getByRole("textbox", { name: /Admin notes/ }), "Wrong document");
    await view.user.click(screen.getByRole("button", { name: /^Reject( new version)? — / }));
    return { ...view, dialog: await screen.findByRole("dialog", { name: "Confirm reject" }) };
  };

  it("warns for a held grant that was live before, whatever step held it this time", async () => {
    const rerun = { ...held, nofo_name: "Rerun-Grant", source: "pipeline" as const };
    const { dialog } = await rejectDialog(rerun, { ...detail, ...rerun, previous_status: "active" });
    expect(within(dialog).getByText("This grant was live. Rejecting deletes it and its files for everyone.")).toBeInTheDocument();
  });

  it("says a held grant that was archived was published, not live", async () => {
    const rerun = { ...held, nofo_name: "Rerun-Grant", source: "pipeline" as const };
    const { dialog } = await rejectDialog(rerun, { ...detail, ...rerun, previous_status: "archived" });
    expect(within(dialog).getByText("This grant was published. Rejecting deletes it and its files for everyone.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/was live/)).not.toBeInTheDocument();
  });

  describe.each(["active", "archived"])("a new version of a %s grant whose published version stays", (liveStatus) => {
    const pending = { ...held, nofo_name: "Live-Grant", source: "pipeline" as const, grantStatus: liveStatus };
    const shown = { ...detail, ...pending, live_status: liveStatus };

    it("offers Reject new version", async () => {
      await openDetail(pending, shown);
      expect(screen.getByRole("button", { name: "Reject new version — the published version stays live" })).toHaveTextContent(
        "Reject new version"
      );
    });

    it("confirms that nothing is deleted, and doesn't warn about deleting the grant", async () => {
      const { dialog } = await rejectDialog(pending, shown);
      expect(within(dialog).getByText("Reject this new version? The published version stays live and nothing is deleted.")).toBeInTheDocument();
      expect(within(dialog).queryByText(/permanently delete/)).not.toBeInTheDocument();
      expect(within(dialog).queryByText(/Rejecting deletes it/)).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Reject new version" })).toHaveTextContent("Reject new version");
    });

    it("rejects only this review when confirmed", async () => {
      const { dialog, user, net } = await rejectDialog(pending, shown, {
        "POST /admin/processing-reviews/Live-Grant/reject": json({ message: "ok", keptLive: true }),
      });
      await user.click(within(dialog).getByRole("button", { name: "Reject new version" }));
      await waitFor(() => expect(net.to("POST /admin/processing-reviews/Live-Grant/reject")).toHaveLength(1));
      expect(net.to("POST /admin/processing-reviews/Live-Grant/reject")[0].body).toMatchObject({ reviewId: shown.review_id });
    });
  });

  it("announces Publishing in the panel's status region, then leaves the result to the notification", async () => {
    let release!: () => void;
    const { user } = await openDetail(held, detail, {
      "POST /admin/processing-reviews/Held-Grant/approve": () =>
        new Promise<Response>((resolve) => { release = () => resolve(json({ message: "ok" })); }),
    });
    const region = screen.getAllByRole("status").find((el) => el.closest("td"))!;
    expect(region).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: /^Approve as is — / }));
    expect(screen.getByRole("button", { name: /^Publishing\.\.\. — / })).toHaveFocus();
    expect(region).toHaveTextContent("Publishing the grant");
    release();
    await waitFor(() => expect(screen.queryByText("Publishing the grant")).not.toBeInTheDocument());
  });

  it("shows the guidance that users keep seeing the published version", async () => {
    const pending = { ...held, nofo_name: "Live-Grant", source: "pipeline" as const };
    const message =
      '"Live-Grant" is live. 1 item on the Requirements page could not be matched to what the grant says. ' +
      "Users keep seeing the published version until you approve or reject this new one.";
    await openDetail(pending, { ...detail, ...pending, live_status: "active", adminGuidance: { ...detail.adminGuidance!, message } });
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("recommends re-uploading when the only failure is text that couldn't be read", async () => {
    await openDetail(held, {
      ...detail,
      adminGuidance: {
        ...detail.adminGuidance!,
        title: "The grant's text couldn't be read",
        failingItems: [{ category: "grant_text", label: "Grant text", item: "Grant text", reason: "The grant text is missing." }],
      },
    });
    expect(screen.getByRole("button", { name: /^Re-upload grant document .*\(recommended\)$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve as is — / })).not.toHaveAccessibleName(/recommended/);
  });
});
