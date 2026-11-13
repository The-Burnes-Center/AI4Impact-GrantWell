import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocumentManager from "./DocumentManager";

vi.mock("../../common/file-uploader", () => ({
  FileUploader: class {
    upload = vi.fn(async () => true);
  },
}));

const LIST = "POST /user-documents/list";
const SESSION = "POST /user-session";
const UPLOAD_URL = "POST /user-documents/upload-url";

const doc = (key: string, name: string, folder: string, lastModified = "2026-11-01T00:00:00Z", size = 1000) => ({
  key, name, folder, size, lastModified,
});
const LIBRARY = [
  doc("user-1/Grant A//budget.pdf", "budget.pdf", "Grant A"),
  doc("user-1/Grant A/letter.docx", "letter.docx", "Grant A"),
  doc("user-1/documents/plan.pdf", "plan.pdf", "documents", "2026-11-02T00:00:00Z"),
  doc("user-1/documents/sheet.xlsx", "sheet.xlsx", "documents"),
];

function server(stored: { document_keys: string[] | null; exists: boolean }, library = LIBRARY) {
  const saved: string[][] = [];
  const net = stubFetch({
    [LIST]: () => json({ documents: library }),
    [SESSION]: (req: RouteRequest) => {
      const body = req.body as Record<string, unknown>;
      if (body.operation === "set_document_keys") {
        saved.push(body.document_keys as string[]);
        return json({ document_keys: body.document_keys });
      }
      return json(stored);
    },
    [UPLOAD_URL]: json({ signedUrl: "https://s3.test/put" }),
  });
  return { net, saved };
}

const open = () =>
  renderApp(<DocumentManager isOpen onClose={() => {}} documentIdentifier="Grant A/" sessionId="s1" />);

describe("chat document picker", () => {
  it("ticks the grant's old uploads for a chat from before the library, and saves a change as the full list", async () => {
    const { saved } = server({ document_keys: null, exists: true });
    const { user } = open();

    const plan = await screen.findByRole("checkbox", { name: /plan\.pdf/ });
    expect(screen.getByRole("group", { name: "Use in this chat" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /budget\.pdf/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /letter\.docx/ })).toBeChecked();
    expect(plan).not.toBeChecked();

    await user.click(plan);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].sort()).toEqual(["user-1/Grant A//budget.pdf", "user-1/Grant A/letter.docx", "user-1/documents/plan.pdf"]);
  });

  it("starts a new chat with nothing ticked", async () => {
    server({ document_keys: null, exists: false });
    open();
    expect(await screen.findByRole("checkbox", { name: /budget\.pdf/ })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
  });

  it("says which files the AI can't read", async () => {
    server({ document_keys: ["user-1/documents/sheet.xlsx"], exists: true });
    open();
    const sheet = await screen.findByRole("checkbox", { name: /sheet\.xlsx/ });
    expect(sheet).toBeChecked();
    expect(sheet).toHaveAccessibleDescription(/The AI can't read this file type/);
  });

  it("uploads a new file into the library and ticks it", async () => {
    const { net, saved } = server({ document_keys: [], exists: true }, LIBRARY);
    const { user, container } = open();
    await screen.findByRole("checkbox", { name: /plan\.pdf/ });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["hello"], "notes.txt", { type: "text/plain" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(net.last(UPLOAD_URL).body).toMatchObject({ fileName: "user-1/documents/notes.txt", fileSize: 5 });
    expect(saved[0]).toEqual(["user-1/documents/notes.txt"]);
  });

  it("refuses an empty file without asking for an upload URL", async () => {
    const { net } = server({ document_keys: [], exists: true });
    const { user, container } = open();
    await screen.findByRole("checkbox", { name: /plan\.pdf/ });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([], "empty.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("empty.pdf is empty (0 bytes)");
    expect(net.to(UPLOAD_URL)).toHaveLength(0);
  });

  it("asks before replacing a same-named file in My documents", async () => {
    server({ document_keys: [], exists: true });
    const { user, container } = open();
    await screen.findByRole("checkbox", { name: /plan\.pdf/ });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("dialog", { name: "File already in your documents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip duplicates" })).toBeInTheDocument();
  });
});
