import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import GrantPanel, { type PanelTab, type SourceFocus } from "./GrantPanel";
import { useChatDocuments } from "../../hooks/use-chat-documents";
import { panelAnswer, type PanelAnswer } from "./chat-panel-context";

vi.mock("../../common/file-uploader", () => ({
  FileUploader: class {
    upload = vi.fn(async () => true);
  },
}));

const LIST = "POST /user-documents/list";
const SESSION = "POST /user-session";
const UPLOAD_URL = "POST /user-documents/upload-url";
const PDF = "GET /grant-pdf-url";

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
    [PDF]: json({ available: true, signedUrl: "https://s3.test/grant" }),
  });
  return { net, saved };
}

const SUMMARY = {
  KeyDeadlines: [
    { item: "SAM.gov registration", description: "Register by June 1, 2026." },
    { item: "Application due", description: "Applications are due March 1, 2027 at 5 p.m. ET. Late ones are not read." },
  ],
  EligibilityCriteria: [{ item: "Award amount", description: "Up to $500,000 per award." }],
  RequiredDocuments: [{ item: "Project narrative", description: "The narrative may not exceed 20 pages." }],
  ProjectNarrativeSections: [] as Array<{ item: string; description: string }>,
};

const ANSWERS: PanelAnswer[] = [
  { reply: 1, question: "Hello", citations: [], sources: [] },
  {
    reply: 2,
    question: "How is it scored?",
    sources: [],
    citations: [
      { n: 1, at: [3], quote: "Design 40%.", document: "Grant document", page: 18 },
      { n: 2, at: [5], quote: "Our plan.", document: "plan.pdf" },
    ],
  },
];

function Harness({ initialTab = "facts", focus = null }: { initialTab?: PanelTab; focus?: SourceFocus | null }) {
  const [tab, setTab] = useState<PanelTab>(initialTab);
  const documents = useChatDocuments("s1", "Grant A/");
  return (
    <GrantPanel
      idPrefix="t"
      label="Grant panel"
      grant="Grant A"
      summary={SUMMARY}
      answers={ANSWERS}
      selectedReply={null}
      focus={focus}
      tab={tab}
      onTab={setTab}
      documents={documents}
      documentsStatus={<p>Reading status here</p>}
    />
  );
}

const open = (props: Parameters<typeof Harness>[0] = { initialTab: "documents" }) => renderApp(<Harness {...props} />);

describe("Grant panel tabs", () => {
  it("is a tablist whose arrow, Home and End keys move and select, with counts in the tab names", async () => {
    server({ document_keys: ["user-1/documents/plan.pdf"], exists: true });
    const { user } = open({ initialTab: "facts" });

    expect(screen.getByRole("tablist", { name: "Grant panel" })).toBeInTheDocument();
    const facts = screen.getByRole("tab", { name: "Facts" });
    expect(facts).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sources, 2" })).toHaveAttribute("tabindex", "-1");
    await screen.findByRole("tab", { name: "Documents, 1 of 4 ticked" });

    facts.focus();
    await user.keyboard("{ArrowRight}");
    const sources = screen.getByRole("tab", { name: "Sources, 2" });
    expect(sources).toHaveFocus();
    expect(sources).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Sources, 2" })).toBeVisible();
    expect(document.getElementById("t-panel-facts")).not.toBeVisible();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /^Documents/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(facts).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /^Documents/ })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(facts).toHaveAttribute("aria-selected", "true");
  });

  it("lists the key facts from the summary and links to all requirements", async () => {
    server({ document_keys: [], exists: true });
    open({ initialTab: "facts" });
    const panel = screen.getByRole("tabpanel", { name: "Facts" });
    const value = (label: string) => within(panel).getByText(label).nextElementSibling?.textContent;
    expect(value("Deadline")).toBe("Applications are due March 1, 2027 at 5 p.m. ET.");
    expect(within(panel).queryByText(/SAM\.gov/)).toBeNull();
    expect(value("Funding")).toBe("Up to $500,000 per award.");
    expect(value("Match")).toBe("Not listed in the grant summary");
    expect(value("Narrative limit")).toBe("The narrative may not exceed 20 pages.");
    expect(within(panel).getByRole("link", { name: "See all requirements" })).toHaveAttribute("href", "/requirements/Grant%20A");
  });

  it("shows the newest answer's sources as cards, the grant's with a link to its page", async () => {
    server({ document_keys: [], exists: true });
    open({ initialTab: "sources" });
    const panel = screen.getByRole("tabpanel", { name: "Sources, 2" });
    expect(within(panel).getByText("For the answer to “How is it scored?”")).toBeInTheDocument();
    expect(within(panel).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["1 · Grant, page 18", "2 · plan.pdf"]);
    const link = await within(panel).findByRole("link", { name: "Open the grant at page 18 (opens in new tab)" });
    expect(link).toHaveAttribute("href", "/grant-pdf?grant=Grant+A&page=18");
    expect(within(panel).getAllByRole("link")).toHaveLength(1);
  });

  it("moves focus to the source card a citation number picked", async () => {
    server({ document_keys: [], exists: true });
    open({ initialTab: "sources", focus: { reply: 2, citation: 2, token: 1 } });
    expect(screen.getByRole("region", { name: "2 · plan.pdf" })).toHaveFocus();
  });

  it("picks the selected answer, else the newest one with sources", () => {
    expect(panelAnswer(ANSWERS, null)?.reply).toBe(2);
    expect(panelAnswer(ANSWERS, 1)?.reply).toBe(1);
    expect(panelAnswer([{ reply: 1, question: "", citations: [], sources: [] }], null)).toBeNull();
  });
});

describe("Grant panel documents", () => {
  it("ticks the grant's old uploads for a chat from before the library, and saves a change as the full list", async () => {
    const { saved } = server({ document_keys: null, exists: true });
    const { user } = open();

    const plan = await screen.findByRole("checkbox", { name: /plan\.pdf/ });
    expect(screen.getByRole("group", { name: "Use in this chat" })).toBeInTheDocument();
    expect(screen.getByText("Reading status here")).toBeInTheDocument();
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

  it("shows each file's type and size, and says which files the AI can't read", async () => {
    server({ document_keys: ["user-1/documents/sheet.xlsx"], exists: true });
    open();
    const sheet = await screen.findByRole("checkbox", { name: /sheet\.xlsx/ });
    expect(sheet).toBeChecked();
    expect(sheet).toHaveAccessibleName(/XLSX · 1000 B/);
    expect(sheet).toHaveAccessibleName(/The AI can't read this file type/);
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
