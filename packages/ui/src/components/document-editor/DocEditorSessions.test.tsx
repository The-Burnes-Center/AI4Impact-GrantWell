import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import { NotificationProvider } from "../notifications/NotificationManager";
import NotificationBar from "../notifications/NotificationBar";
import DocEditorSessions from "./DocEditorSessions";

const drafts = [
  { sessionId: "a", title: "Fiber plan", documentIdentifier: "Broadband", status: "editing_sections", lastModified: "2026-10-01T00:00:00Z" },
  { sessionId: "b", title: "Transit study", documentIdentifier: "Rural Transit", status: "project_basics", lastModified: "2026-10-02T00:00:00Z" },
];

function renderList({ deleted = true } = {}) {
  const net = stubFetch({
    "POST /user-draft": (req) =>
      (req.body as { operation?: string }).operation === "delete_draft" ? json({ deleted }) : json(drafts),
    "GET /application-outcomes": json({
      outcomes: [{ sessionId: "a", status: "awarded", submittedDate: null, decisionDate: "2026-10-10", amountAwarded: 40000, updatedAt: "2026-10-11" }],
    }),
    "PUT /application-outcomes/b": (req) => json({ sessionId: "b", submittedDate: null, decisionDate: null, amountAwarded: null, updatedAt: "2026-10-27", ...(req.body as object) }),
  });
  return {
    net,
    ...renderApp(
      <NotificationProvider>
        <NotificationBar />
        <DocEditorSessions toolsOpen={false} documentIdentifier={null} />
      </NotificationProvider>
    ),
  };
}

const rowFor = async (title: string) =>
  (await screen.findByRole("button", { name: new RegExp(`^Open application: ${title}, last modified `) })).closest('[role="row"]') as HTMLElement;

describe("DocEditorSessions outcomes", () => {
  it("shows each application's recorded outcome", async () => {
    renderList();
    expect(within(await rowFor("Fiber plan")).getByText("Awarded · $40,000")).toBeInTheDocument();
    expect(within(await rowFor("Transit study")).getByText("Not recorded")).toBeInTheDocument();
  });

  it("records an outcome from the row", async () => {
    const { net, user } = renderList();
    await user.click(await screen.findByRole("button", { name: /^Update outcome for Transit study, last modified / }));
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

describe("DocEditorSessions list actions", () => {
  it("announces a delete and moves focus to the heading instead of the now-disabled Delete", async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole("checkbox", { name: /^Select application: Fiber plan, last modified / }));
    await user.click(screen.getByRole("button", { name: "Delete 1 selected application" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete application" });
    await user.click(within(dialog).getByRole("button", { name: /Delete permanently/ }));

    expect(await screen.findByText("Application deleted.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My applications" })).toHaveFocus();
  });

  it("announces a failed delete", async () => {
    const { user } = renderList({ deleted: false });
    await user.click(await screen.findByRole("checkbox", { name: /^Select application: Fiber plan, last modified / }));
    await user.click(screen.getByRole("button", { name: "Delete 1 selected application" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete application" });
    await user.click(within(dialog).getByRole("button", { name: /Delete permanently/ }));

    const message = await screen.findByText("The applications could not be deleted. Please try again.");
    expect(screen.getByRole("alert")).toContainElement(message);
  });

  it("announces when a refresh finishes", async () => {
    const { user } = renderList();
    await rowFor("Fiber plan");
    await user.click(screen.getByRole("button", { name: "Refresh applications list" }));
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent === "Applications updated")).toBe(true)
    );
  });
});
