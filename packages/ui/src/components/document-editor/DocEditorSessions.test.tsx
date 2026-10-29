import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocEditorSessions from "./DocEditorSessions";

const drafts = [
  { sessionId: "a", title: "Fiber plan", documentIdentifier: "Broadband", status: "editing_sections", lastModified: "2026-10-01T00:00:00Z" },
  { sessionId: "b", title: "Transit study", documentIdentifier: "Rural Transit", status: "project_basics", lastModified: "2026-10-02T00:00:00Z" },
];

function renderList() {
  const net = stubFetch({
    "POST /user-draft": json(drafts),
    "GET /application-outcomes": json({
      outcomes: [{ sessionId: "a", status: "awarded", submittedDate: null, decisionDate: "2026-10-10", amountAwarded: 40000, updatedAt: "2026-10-11" }],
    }),
    "PUT /application-outcomes/b": (req) => json({ sessionId: "b", submittedDate: null, decisionDate: null, amountAwarded: null, updatedAt: "2026-10-27", ...(req.body as object) }),
  });
  return { net, ...renderApp(<DocEditorSessions toolsOpen={false} documentIdentifier={null} />) };
}

const rowFor = async (title: string) => (await screen.findByRole("button", { name: `Open application: ${title}` })).closest('[role="row"]') as HTMLElement;

describe("DocEditorSessions outcomes", () => {
  it("shows each application's recorded outcome", async () => {
    renderList();
    expect(within(await rowFor("Fiber plan")).getByText("Awarded · $40,000")).toBeInTheDocument();
    expect(within(await rowFor("Transit study")).getByText("Not recorded")).toBeInTheDocument();
  });

  it("records an outcome from the row", async () => {
    const { net, user } = renderList();
    await user.click(await screen.findByRole("button", { name: "Update outcome for Transit study" }));
    const dialog = await screen.findByRole("dialog", { name: "Update outcome" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.selectOptions(within(dialog).getByLabelText("Outcome"), "submitted");
    // jsdom ignores typing into date inputs.
    fireEvent.change(within(dialog).getByLabelText("Date submitted"), { target: { value: "2026-10-20" } });
    await user.click(within(dialog).getByRole("button", { name: "Save outcome" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update outcome" })).toBeNull());
    expect(net.last("PUT /application-outcomes/b").body).toEqual({ status: "submitted", submittedDate: "2026-10-20" });
    expect(within(await rowFor("Transit study")).getByText("Submitted, waiting to hear")).toBeInTheDocument();
  });
});
