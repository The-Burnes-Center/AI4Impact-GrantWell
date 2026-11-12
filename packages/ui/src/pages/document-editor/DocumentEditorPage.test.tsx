import { screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocumentEditor from "./DocumentEditorPage";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));
vi.mock("../../common/helpers/recently-viewed-nofos", () => ({
  addToRecentlyViewed: vi.fn(),
  fetchRecentlyViewed: async (): Promise<never[]> => [],
}));

const DRAFT = "POST /user-draft";
const SUMMARY = "GET /s3-nofo-summary";
const NOFOS = "GET /s3-nofo-bucket-data";

const GRANT = { data: { GrantName: "Grant A", ProjectNarrativeSections: [{ item: "Budget", description: "Costs." }] } };

function stubServer(row: Record<string, unknown> | null) {
  return stubFetch({
    [SUMMARY]: json(GRANT),
    [NOFOS]: json({ nofoData: [{ name: "Grant A", grant_type: "federal" }] }),
    [DRAFT]: (req: RouteRequest) => {
      const body = req.body as Record<string, unknown>;
      if (body.operation === "get_draft") return row ? json(row) : json({});
      if (body.operation === "update_draft") return json({ ...row, status: body.status, rev: 2 });
      return json({});
    },
  });
}

const renderEditor = (search: string) =>
  renderApp(
    <Routes>
      <Route path="/document-editor/:sessionId" element={<DocumentEditor />} />
    </Routes>,
    { route: `/document-editor/s1${search}` }
  );

const updates = (net: ReturnType<typeof stubFetch>) =>
  net.to(DRAFT).map((r) => r.body as Record<string, unknown>).filter((b) => b.operation === "update_draft");

describe("DocumentEditorPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  it("says a deleted application doesn't exist instead of waiting for a draft", async () => {
    const net = stubServer(null);
    renderEditor("?step=sectionEditor");

    expect(await screen.findByRole("heading", { level: 1, name: "Application not found" })).toBeInTheDocument();
    expect(screen.getByText("This application doesn't exist. It may have been deleted.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My applications" })).toHaveAttribute("href", "/document-editor/drafts");
    expect(screen.queryByText(/This may take 30-60 seconds/)).not.toBeInTheDocument();
    expect(net.to(DRAFT)).toHaveLength(1);
  });

  it("opens Project basics for an application with no row yet", async () => {
    stubServer(null);
    renderEditor("?step=projectBasics&grant=Grant%20A");
    expect(await screen.findByRole("heading", { level: 1, name: "Grant A" })).toBeInTheDocument();
    expect(screen.queryByText("Application not found")).not.toBeInTheDocument();
  });

  it("saves the Review status when the application is opened on Review", async () => {
    const net = stubServer({
      session_id: "s1",
      document_identifier: "Grant A",
      title: "Application for Grant A",
      status: "editing_sections",
      sections: { Budget: "We need $10." },
      rev: 1,
    });
    renderEditor("?step=reviewApplication&grant=Grant%20A");

    await waitFor(() => expect(updates(net).map((b) => b.status)).toEqual(["reviewing"]));
    expect(updates(net)[0].sections).toEqual({ Budget: "We need $10." });
  });

  it("keeps the grant picker open and says it is starting, with no empty form behind it", async () => {
    let finishCreate: (reply: Response) => void = () => {};
    stubFetch({
      [SUMMARY]: json(GRANT),
      [NOFOS]: json({ nofoData: [{ name: "Grant A", status: "active" }] }),
      [DRAFT]: (req: RouteRequest) => {
        const body = req.body as Record<string, unknown>;
        if (body.operation === "add_draft") return new Promise<Response>((resolve) => { finishCreate = resolve; });
        if (body.operation === "get_draft") return json({ session_id: body.session_id, document_identifier: "Grant A/", status: "project_basics", rev: 1 });
        return json({});
      },
    });
    const { user } = renderApp(
      <Routes>
        <Route path="/document-editor" element={<DocumentEditor />} />
        <Route path="/document-editor/:sessionId" element={<DocumentEditor />} />
      </Routes>,
      { route: "/document-editor" }
    );

    await user.click(await screen.findByRole("button", { name: "Get started" }));
    const picker = await screen.findByRole("dialog", { name: "Start a new application" });
    await user.click(await within(picker).findByRole("button", { name: "Grant A" }));

    expect(await within(picker).findByText("Starting…")).toBeInTheDocument();
    expect(within(picker).getByText("Starting…").closest("[aria-busy='true']")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Project name/ })).not.toBeInTheDocument();

    finishCreate(json({ session_id: "new" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Start a new application" })).not.toBeInTheDocument());
    expect(await screen.findByRole("textbox", { name: /Project name/ })).toBeInTheDocument();
  });
});
