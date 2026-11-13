import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocumentsPage from "./DocumentsPage";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));

const LIST = "POST /user-documents/list";
const DELETE = "POST /user-documents/delete";

const LIBRARY = [
  { key: "user-1/Grant A//budget.pdf", name: "budget.pdf", folder: "Grant A", size: 2048, lastModified: "2026-10-01T00:00:00Z" },
  { key: "user-1/documents/plan.pdf", name: "plan.pdf", folder: "documents", size: 10, lastModified: "2026-11-01T00:00:00Z" },
];

describe("My documents", () => {
  it("lists every document, newest first, with where older ones were uploaded", async () => {
    stubFetch({ [LIST]: json({ documents: LIBRARY }) });
    renderApp(<DocumentsPage />, { route: "/documents" });

    expect(await screen.findByRole("heading", { level: 1, name: "My documents" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: /Your documents/ });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/\.pdf$/).textContent)).toEqual(["plan.pdf", "budget.pdf"]);
    expect(within(items[1]).getByText(/for Grant A/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toBeInTheDocument();
  });

  it("says when there are no documents, and describes Browse files with the file limits", async () => {
    stubFetch({ [LIST]: json({ documents: [] }) });
    renderApp(<DocumentsPage />, { route: "/documents" });

    expect(await screen.findByText(/None yet\. Documents you upload appear here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toHaveAccessibleDescription(
      "PDF, Word, Excel, PowerPoint, text and more, up to 100 MB each"
    );
  });

  it("asks before deleting and deletes by the file's real key", async () => {
    const net = stubFetch({ [LIST]: json({ documents: LIBRARY }), [DELETE]: json({ message: "ok" }) });
    const { user } = renderApp(<DocumentsPage />, { route: "/documents" });

    await user.click(await screen.findByRole("button", { name: "Delete budget.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete document?" });
    expect(dialog).toHaveTextContent("from every chat and application that uses it");

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(net.to(DELETE)).toHaveLength(1));
    expect(net.last(DELETE).body).toEqual({ KEY: "user-1/Grant A//budget.pdf" });
    await waitFor(() => expect(screen.queryByText("budget.pdf")).not.toBeInTheDocument());
    expect(screen.getAllByRole("status").some((s) => s.textContent === "budget.pdf deleted.")).toBe(true);
  });
});
