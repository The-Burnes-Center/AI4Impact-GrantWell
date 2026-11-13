import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import DocumentReviewsTab from "./DocumentReviewsTab";

const REVIEWS = "GET /admin/document-reviews";
const DECIDE = "POST /admin/document-reviews";

const PENDING = {
  userId: "user-1",
  key: "user-1/documents/essay.txt",
  fileName: "essay.txt",
  grant: "Bridge Grant",
  typeLabel: "Data or needs assessment",
  reason: "School homework, not about the project.",
  verdict: "unrelated",
  note: "It has our survey results.",
  status: "pending",
  requestedAt: "2026-11-02T00:00:00Z",
  userEmail: "pat@example.org",
  userState: "MA",
  adminNote: null as string | null,
  decidedAt: null as string | null,
};

const render = () => renderApp(<DocumentReviewsTab apiClient={testApiClient()} />);

describe("Document reviews", () => {
  it("lists what each request needs for a decision", async () => {
    const net = stubFetch({ [REVIEWS]: json({ reviews: [PENDING] }) });
    render();

    const item = await screen.findByRole("listitem");
    expect(within(item).getByRole("heading", { level: 4, name: "essay.txt" })).toBeInTheDocument();
    for (const text of ["Bridge Grant", "Data or needs assessment", "pat@example.org (MA)", "School homework, not about the project.", "It has our survey results."]) {
      expect(item).toHaveTextContent(text);
    }
    expect(net.last(REVIEWS).url.searchParams.get("status")).toBe("pending");
    expect(screen.getByRole("button", { name: "Waiting for a decision" })).toHaveAttribute("aria-pressed", "true");
  });

  it("approves with an optional note, then takes the request off the list and says so", async () => {
    const net = stubFetch({
      [REVIEWS]: json({ reviews: [PENDING] }),
      [DECIDE]: (req: RouteRequest) => json({ review: { ...PENDING, status: "approved", adminNote: (req.body as { note: string }).note } }),
    });
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "Approve essay.txt for Bridge Grant" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve this document?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Note to the person (optional)" }), "Survey data counts.");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(net.to(DECIDE)).toHaveLength(1));
    expect(net.last(DECIDE).body).toEqual({ action: "approve", userId: "user-1", key: PENDING.key, grant: "Bridge Grant", note: "Survey data counts." });
    expect(await screen.findByText("No requests are waiting for a decision.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "essay.txt approved for Bridge Grant.")).toBe(true);
  });

  it("keeps the dialog open with the error when the decision fails", async () => {
    stubFetch({ [REVIEWS]: json({ reviews: [PENDING] }), [DECIDE]: json({ message: "This request was already decided." }, 409) });
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "Reject essay.txt for Bridge Grant" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This request was already decided.");
  });

  it("shows decided requests with the decision and no actions", async () => {
    stubFetch({
      [REVIEWS]: (req: RouteRequest) =>
        json({
          reviews:
            req.url.searchParams.get("status") === "decided"
              ? [{ ...PENDING, status: "rejected", adminNote: "Not about bridges.", decidedAt: "2026-11-03T00:00:00Z" }]
              : [],
        }),
    });
    const { user } = render();

    expect(await screen.findByText("No requests are waiting for a decision.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decided" }));

    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent(/Rejected .*: Not about bridges\./);
    expect(within(item).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });
});
