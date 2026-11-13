import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocumentsPage from "./DocumentsPage";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));
vi.mock("../../common/file-uploader", () => ({ FileUploader: class { upload = async () => true; } }));

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

describe("Document types", () => {
  const TYPED = [
    { ...LIBRARY[0], type: null as string | null },
    { ...LIBRARY[1], type: "other", description: "Board minutes" },
  ];

  it("shows each document's type before its size, and Type not set for older ones", async () => {
    stubFetch({ [LIST]: json({ documents: TYPED }) });
    renderApp(<DocumentsPage />, { route: "/documents" });

    const items = within(await screen.findByRole("list", { name: /Your documents/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Other: Board minutes · 10 B/);
    expect(items[1]).toHaveTextContent(/Type not set · 2.0 KB/);
    expect(within(items[1]).getByRole("button", { name: "Set type of budget.pdf" })).toBeInTheDocument();
  });

  it("sets a type, with the description error tied to its field", async () => {
    const TYPE = "POST /user-documents/type";
    const net = stubFetch({ [LIST]: json({ documents: TYPED }), [TYPE]: json({ key: "x" }) });
    const { user } = renderApp(<DocumentsPage />, { route: "/documents" });

    await user.click(await screen.findByRole("button", { name: "Set type of budget.pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "Document type" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const select = within(dialog).getByRole("combobox", { name: /Document type/ });
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Choose a document type.");
    expect(select).toHaveFocus();

    await user.selectOptions(select, "other");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const description = within(dialog).getByRole("textbox", { name: /What is it\?/ });
    expect(description).toHaveAccessibleDescription(/Describe the document in a few words\./);
    expect(net.to(TYPE)).toHaveLength(0);

    await user.type(description, "Audit letter");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(net.to(TYPE)).toHaveLength(1));
    expect(net.last(TYPE).body).toEqual({ key: "user-1/Grant A//budget.pdf", type: "other", description: "Audit letter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/Other: Audit letter · 2.0 KB/)).toBeInTheDocument();
  });

  it("asks what kind of document each upload is and sends the type with the upload", async () => {
    const UPLOAD = "POST /user-documents/upload-url";
    const net = stubFetch({
      [LIST]: json({ documents: TYPED }),
      [UPLOAD]: json({ signedUrl: "https://bucket.test/put" }),
    });
    const { user, container } = renderApp(<DocumentsPage />, { route: "/documents" });
    await screen.findByRole("list", { name: /Your documents/ });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["x"], "letter.pdf", { type: "application/pdf" }));
    const dialog = await screen.findByRole("dialog", { name: "What kind of document is this?" });
    expect(within(dialog).getByRole("group", { name: "letter.pdf" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));
    expect(within(dialog).getByRole("combobox", { name: /Document type/ })).toHaveAccessibleDescription("Choose a document type.");
    expect(net.to(UPLOAD)).toHaveLength(0);

    await user.selectOptions(within(dialog).getByRole("combobox", { name: /Document type/ }), "letter-of-support");
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(net.to(UPLOAD)).toHaveLength(1));
    expect(net.last(UPLOAD).body).toMatchObject({ fileName: expect.stringMatching(/\/documents\/letter\.pdf$/), documentType: "letter-of-support" });
  });
});
