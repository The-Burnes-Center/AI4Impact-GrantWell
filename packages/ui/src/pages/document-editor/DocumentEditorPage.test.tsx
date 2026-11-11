import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import DocumentEditor from "./DocumentEditorPage";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));

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
});
