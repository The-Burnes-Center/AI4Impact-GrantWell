import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import type { useDraftSave } from "../../hooks/use-draft-save";
import UploadDocuments from "./UploadDocuments";

const LIST = "POST /user-documents/list";
const DRAFT = "POST /user-draft";
const SUMMARY = "GET /s3-nofo-summary";
const QUESTIONS = "GET /s3-nofo-questions";
const START = "POST /draft-generation";
const JOB = "GET /draft-generation-jobs/job-1";
const RELEVANCE = "POST /user-documents/relevance";

const related = (req: RouteRequest) =>
  json({ documents: (req.body as { documentKeys: string[] }).documentKeys.map((key) => ({ key, status: "related", usable: true })) });

const LIBRARY = [
  { key: "user-1/Grant A//budget.pdf", name: "budget.pdf", folder: "Grant A", size: 10, lastModified: "2026-10-01T00:00:00Z" },
  { key: "user-1/documents/plan.pdf", name: "plan.pdf", folder: "documents", size: 10, lastModified: "2026-11-01T00:00:00Z" },
];

function fakeDraftSave() {
  return {
    saveFields: vi.fn(async () => undefined),
    saveStatus: "idle",
    lastSavedAt: null,
    retry: vi.fn(),
  } as unknown as ReturnType<typeof useDraftSave> & { saveFields: ReturnType<typeof vi.fn> };
}

function server(row: Record<string, unknown>) {
  return stubFetch({
    [LIST]: json({ documents: LIBRARY }),
    [DRAFT]: (req: RouteRequest) => json((req.body as { operation: string }).operation === "get_draft" ? row : {}),
    [SUMMARY]: json({ data: { ProjectNarrativeSections: [{ item: "Need", description: "d" }] } }),
    [QUESTIONS]: json({ data: { questions: [] } }),
    [START]: json({ jobId: "job-1" }),
    [JOB]: json({ jobId: "job-1", status: "in_progress", sectionNames: ["Need"] }),
    [RELEVANCE]: related,
  });
}

const BASE_ROW = { session_id: "s1", document_identifier: "Grant A/", sections: {}, questionnaire: {}, project_basics: {} };

describe("Write application documents", () => {
  it("reads the grant's old uploads for an application from before the library until changed", async () => {
    server(BASE_ROW);
    const draftSave = fakeDraftSave();
    const { user } = renderApp(
      <UploadDocuments selectedNofo="Grant A/" onNavigate={() => {}} sessionId="s1" draftSave={draftSave} />
    );

    expect(await screen.findByRole("checkbox", { name: /budget\.pdf/ })).toBeChecked();
    expect(screen.getByRole("group", { name: "Use in this application" })).toBeInTheDocument();
    const plan = screen.getByRole("checkbox", { name: /plan\.pdf/ });
    expect(plan).not.toBeChecked();

    await user.click(plan);

    expect(draftSave.saveFields).toHaveBeenCalledWith({
      documentKeys: ["user-1/documents/plan.pdf", "user-1/Grant A//budget.pdf"],
    });
  });

  it("starts the draft right away with the application's selection", async () => {
    const net = server({ ...BASE_ROW, document_keys: ["user-1/documents/plan.pdf"] });
    const draftSave = fakeDraftSave();
    const onNavigateToEditor = vi.fn();
    const { user } = renderApp(
      <UploadDocuments
        selectedNofo="Grant A/"
        onNavigate={() => {}}
        onNavigateToEditor={onNavigateToEditor}
        sessionId="s1"
        draftSave={draftSave}
      />
    );
    expect(await screen.findByRole("checkbox", { name: /plan\.pdf/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /budget\.pdf/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => expect(net.to(START)).toHaveLength(1));
    expect(net.last(START).body).toMatchObject({ documentKeys: ["user-1/documents/plan.pdf"] });
    await waitFor(() => expect(onNavigateToEditor).toHaveBeenCalledWith("job-1"), { timeout: 4000 });
  });

  it("says the AI writer waits while the grant is in review, and leaves the application where it was", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const net = stubFetch({
      [LIST]: json({ documents: LIBRARY }),
      [DRAFT]: (req: RouteRequest) => json((req.body as { operation: string }).operation === "get_draft" ? BASE_ROW : {}),
      [SUMMARY]: json({ inReview: true, data: { ProjectNarrativeSections: [{ item: "Need", description: "d" }] } }),
      [QUESTIONS]: json({ data: { questions: [] } }),
      [START]: json({ error: "GRANT_IN_REVIEW", message: "This grant is being reviewed and will be back soon." }, 409),
      [RELEVANCE]: related,
    });
    const draftSave = fakeDraftSave();
    const onNavigateToEditor = vi.fn();
    const { user } = renderApp(
      <UploadDocuments
        selectedNofo="Grant A/"
        onNavigate={() => {}}
        onNavigateToEditor={onNavigateToEditor}
        sessionId="s1"
        draftSave={draftSave}
      />
    );
    await screen.findByRole("checkbox", { name: /budget\.pdf/ });

    await user.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByText("This grant is being reviewed and will be back soon.")).toBeInTheDocument();
    expect(screen.queryByText(/GRANT_IN_REVIEW/)).not.toBeInTheDocument();
    expect(onNavigateToEditor).not.toHaveBeenCalled();
    expect(draftSave.saveFields).toHaveBeenLastCalledWith(
      { status: "uploading_documents" },
      { source: "status_change", immediate: true }
    );
    expect(net.to(SUMMARY).every((r) => r.url.searchParams.get("for") === "application")).toBe(true);
    expect(net.to(QUESTIONS).length).toBeGreaterThan(0);
    expect(net.to(QUESTIONS).every((r) => r.url.searchParams.get("for") === "application")).toBe(true);
  });
});

describe("Write application document checks", () => {
  function checkServer(statuses: Record<string, object>, extra: Record<string, (req: RouteRequest) => Response> = {}) {
    return stubFetch({
      [LIST]: json({ documents: LIBRARY }),
      [DRAFT]: (req: RouteRequest) => json((req.body as { operation: string }).operation === "get_draft" ? BASE_ROW : {}),
      [RELEVANCE]: (req: RouteRequest) =>
        json({
          documents: (req.body as { documentKeys: string[] }).documentKeys.map((key) => ({ key, ...(statuses[key] ?? { status: "related", usable: true }) })),
        }),
      ...extra,
    });
  }
  const render = () =>
    renderApp(<UploadDocuments selectedNofo="Grant A/" onNavigate={() => {}} sessionId="s1" draftSave={fakeDraftSave()} />);

  it("checks ticked documents against the grant and says why one won't be used", async () => {
    const net = checkServer({
      "user-1/Grant A//budget.pdf": { status: "unrelated", usable: false, reason: "A recipe, not about the project." },
    });
    render();

    const budget = await screen.findByRole("checkbox", { name: /budget\.pdf/ });
    await waitFor(() => expect(budget).toHaveAccessibleDescription(/Not used: doesn't look related to this grant/));
    expect(budget).toHaveAccessibleDescription(/A recipe, not about the project\./);
    expect(net.last(RELEVANCE).body).toEqual({ documentIdentifier: "Grant A/", documentKeys: ["user-1/Grant A//budget.pdf"], check: true });
    expect(screen.getAllByRole("status").some((s) => /budget\.pdf: Not used/.test(s.textContent ?? ""))).toBe(true);
  });

  it("checks a document as soon as it is ticked", async () => {
    const net = checkServer({});
    const { user } = render();

    await user.click(await screen.findByRole("checkbox", { name: /plan\.pdf/ }));

    await waitFor(() => expect(net.to(RELEVANCE).map((r) => (r.body as { documentKeys: string[] }).documentKeys)).toContainEqual(["user-1/documents/plan.pdf"]));
  });

  it("sends a This is related request with the note and shows it is waiting", async () => {
    const REVIEW = "POST /user-documents/relevance/review";
    const net = checkServer(
      { "user-1/Grant A//budget.pdf": { status: "unrelated", usable: false, reason: "Homework." } },
      {
        [REVIEW]: () =>
          json({ key: "user-1/Grant A//budget.pdf", status: "review-pending", usable: false, review: { status: "pending", requestedAt: "x" } }),
      }
    );
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "budget.pdf is related: ask an admin" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask an admin to review" });
    await user.type(within(dialog).getByRole("textbox", { name: "How is it related? (optional)" }), "Our budget table");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(net.to(REVIEW)).toHaveLength(1));
    expect(net.last(REVIEW).body).toEqual({ documentIdentifier: "Grant A/", key: "user-1/Grant A//budget.pdf", note: "Our budget table" });
    expect(await screen.findByText("Not used yet: an admin is reviewing your request")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers Try again when the check couldn't run", async () => {
    let calls = 0;
    const net = checkServer({}, {
      [RELEVANCE]: (req: RouteRequest) => {
        calls += 1;
        const key = (req.body as { documentKeys: string[] }).documentKeys[0];
        return json({ documents: [{ key, ...(calls === 1 ? { status: "check-failed", usable: false } : { status: "related", usable: true }) }] });
      },
    });
    const { user } = render();

    await user.click(await screen.findByRole("button", { name: "Check budget.pdf again" }));

    await waitFor(() => expect(net.to(RELEVANCE)).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText("Couldn't check this document yet, try again")).not.toBeInTheDocument());
  });
});
