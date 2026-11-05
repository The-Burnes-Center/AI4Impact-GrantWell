import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import { useDraftSave } from "../../hooks/use-draft-save";
import { NotificationProvider } from "../../components/notifications/NotificationManager";
import NotificationBar from "../../components/notifications/NotificationBar";
import SectionEditor from "./SectionsEditor";

const DRAFT = "POST /user-draft";
const SUMMARY = "GET /s3-nofo-summary";
const JOB = "GET /draft-generation-jobs/job-1";

const GRANT = {
  data: {
    ProjectNarrativeSections: [
      { item: "Statement of Need", description: "Why the project is needed." },
      { item: "Budget", description: "What it costs." },
    ],
  },
};
const ORDER = [
  { id: "statement-of-need", name: "Statement of Need" },
  { id: "budget", name: "Budget" },
];

function Editor(props: { activeJobId?: string; isGenerating?: boolean }) {
  const draftSave = useDraftSave({ sessionId: "s1", documentIdentifier: "Grant A", delay: 10, persistOnExit: false });
  return (
    <SectionEditor
      onContinue={() => {}}
      selectedNofo="Grant A"
      sessionId="s1"
      draftSave={draftSave}
      {...props}
    />
  );
}

interface Fake {
  row: Record<string, unknown>;
  job?: Record<string, unknown>;
  itemBytes?: number;
  versionStatus?: number;
}

function stubServer(fake: Fake, grant: unknown = GRANT) {
  return stubFetch({
    [SUMMARY]: json(grant),
    [JOB]: () => json(fake.job ?? { jobId: "job-1", status: "in_progress" }),
    [DRAFT]: (req: RouteRequest) => {
      const body = req.body as Record<string, unknown>;
      switch (body.operation) {
        case "get_draft":
          return json(fake.row);
        case "update_draft":
          fake.row = { ...fake.row, sections: body.sections, section_order: body.section_order ?? fake.row.section_order };
          return json({
            ...fake.row,
            sectionOrder: fake.row.section_order,
            rev: 2,
            itemBytes: fake.itemBytes ?? 2000,
            itemLimitBytes: 409600,
          });
        case "list_draft_versions":
          return json({ versions: [] });
        case "create_draft_version":
          return json({ rev: 3, label: null, oversize: false }, fake.versionStatus ?? 200);
        default:
          return json({});
      }
    },
  });
}

const updates = (net: ReturnType<typeof stubFetch>) =>
  net.to(DRAFT).map((r) => r.body as Record<string, unknown>).filter((b) => b.operation === "update_draft");

describe("SectionsEditor while the AI writes", () => {
  it("keeps every section read-only, saves nothing typed, and unlocks with the server's text", async () => {
    const fake: Fake = {
      row: {
        session_id: "s1",
        status: "generating_draft",
        sections: { "statement-of-need": "Earlier text" },
        section_order: ORDER,
        rev: 1,
      },
    };
    const net = stubServer(fake);
    const { user } = renderApp(<Editor activeJobId="job-1" isGenerating />);

    const editor = await screen.findByRole("textbox", { name: "Statement of Need" });
    await waitFor(() => expect(editor).toHaveValue("Earlier text"));
    expect(editor).toHaveAttribute("readonly");
    expect(editor).toHaveAttribute("aria-readonly", "true");
    expect(editor).toHaveAccessibleDescription(/read-only while they are being written/);
    expect(screen.getByRole("button", { name: /Version history/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add section/ })).toBeDisabled();

    await user.type(editor, " and more");
    expect(editor).toHaveValue("Earlier text");
    expect(updates(net)).toEqual([]);

    fake.row = {
      ...fake.row,
      status: "editing_sections",
      sections: { "statement-of-need": "Kept by the server", budget: "AI budget" },
    };
    fake.job = {
      jobId: "job-1",
      status: "completed",
      sections: { "statement-of-need": "AI need", budget: "AI budget" },
    };

    await waitFor(() => expect(editor).not.toHaveAttribute("readonly"), { timeout: 5000 });
    expect(editor).toHaveValue("Kept by the server");
    expect(editor).not.toHaveAttribute("aria-readonly");
    expect(updates(net)).toEqual([]);
  });
});

describe("SectionsEditor sections", () => {
  it("shows an empty state for a grant without narrative sections and lets the applicant add one", async () => {
    const fake: Fake = { row: { session_id: "s1", status: "editing_sections", sections: {}, section_order: [], rev: 1 } };
    const net = stubServer(fake, { data: { ProjectNarrativeSections: [] } });
    const { user } = renderApp(<Editor />);

    expect(
      await screen.findByText("This grant doesn't list narrative sections. Add your own section to start writing.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Project Summary")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Section name"), "Annex");
    await user.click(screen.getByRole("button", { name: "Add section" }));

    expect(await screen.findByRole("heading", { name: "Annex" })).toBeInTheDocument();
    await waitFor(() => expect(updates(net)).toHaveLength(1));
    expect(updates(net)[0]).toMatchObject({
      sections: { "custom-annex": "" },
      section_order: [{ id: "custom-annex", name: "Annex" }],
    });
  });

  it("converts an application saved under section names the first time it opens", async () => {
    const fake: Fake = {
      row: { session_id: "s1", status: "editing_sections", sections: { "Statement of Need": "Old text" }, rev: 4 },
    };
    const net = stubServer(fake);
    renderApp(<Editor />);

    expect(await screen.findByRole("textbox", { name: "Statement of Need" })).toHaveValue("Old text");
    await waitFor(() => expect(updates(net)).toHaveLength(1));
    expect(updates(net)[0]).toMatchObject({
      sections: { "statement-of-need": "Old text" },
      section_order: ORDER,
    });
  });
});

describe("SectionsEditor versions", () => {
  const saveVersion = async (versionStatus: number) => {
    const fake: Fake = {
      row: { session_id: "s1", status: "editing_sections", sections: { budget: "x" }, section_order: ORDER, rev: 1 },
      versionStatus,
    };
    stubServer(fake);
    const { user } = renderApp(
      <NotificationProvider>
        <NotificationBar />
        <Editor />
      </NotificationProvider>
    );
    await screen.findByRole("textbox", { name: "Statement of Need" });
    await user.click(screen.getByRole("button", { name: "Save version" }));
    const dialog = await screen.findByRole("dialog", { name: "Save a version" });
    await user.click(within(dialog).getByRole("button", { name: "Save version" }));
  };

  it("announces a saved version", async () => {
    await saveVersion(200);
    const message = await screen.findByText("Version saved.");
    expect(screen.getAllByRole("status").some((region) => region.contains(message))).toBe(true);
  });

  it("announces a version that could not be saved", async () => {
    await saveVersion(500);
    const message = await screen.findByText("The version could not be saved. Please try again.");
    expect(screen.getAllByRole("alert").some((region) => region.contains(message))).toBe(true);
  });
});

describe("SectionsEditor rewriting failed sections", () => {
  it("says the AI writer waits while the grant is in review, and keeps the failed sections to retry later", async () => {
    let row: Record<string, unknown> = {
      session_id: "s1",
      status: "generating_draft",
      sections: {},
      section_order: ORDER,
      rev: 1,
    };
    const net = stubFetch({
      [SUMMARY]: json({ inReview: true, ...GRANT }),
      [JOB]: json({ jobId: "job-1", status: "partial", sections: { "statement-of-need": "AI need" }, failedSections: ["budget"] }),
      "GET /s3-nofo-questions": json({ data: { questions: [] } }),
      "POST /draft-generation": json({ error: "GRANT_IN_REVIEW", message: "This grant is being reviewed and will be back soon." }, 409),
      [DRAFT]: (req: RouteRequest) => {
        const body = req.body as Record<string, unknown>;
        if (body.operation === "get_draft") return json(row);
        if (body.operation === "update_draft") {
          row = { ...row, sections: body.sections, status: body.status ?? row.status };
          return json({ ...row, sectionOrder: ORDER, rev: 2, itemBytes: 2000, itemLimitBytes: 409600 });
        }
        return json({ versions: [] });
      },
    });
    const { user } = renderApp(
      <NotificationProvider>
        <NotificationBar />
        <Editor activeJobId="job-1" isGenerating />
      </NotificationProvider>
    );

    const retry = await screen.findByRole("button", { name: "Retry Failed Sections" }, { timeout: 5000 });
    await user.click(retry);

    const message = await screen.findByText("This grant is being reviewed and will be back soon.");
    expect(screen.getAllByRole("alert").some((region) => region.contains(message))).toBe(true);
    expect(screen.getByRole("button", { name: "Retry Failed Sections" })).toBeInTheDocument();
    expect(net.last("POST /draft-generation").body).toMatchObject({ sectionIds: ["budget"] });
    expect(net.to(SUMMARY).every((r) => r.url.searchParams.get("for") === "application")).toBe(true);
  });
});

describe("SectionsEditor while the grant is in review", () => {
  const row = { session_id: "s1", status: "editing_sections", sections: { "statement-of-need": "My text" }, section_order: ORDER, rev: 1 };

  it("shows only section names with a note, and keeps the applicant's text editable", async () => {
    const net = stubServer({ row: { ...row } }, { inReview: true, ...GRANT });
    const { user } = renderApp(<Editor />);

    const editor = await screen.findByRole("textbox", { name: "Statement of Need" });
    await waitFor(() => expect(editor).toHaveValue("My text"));
    expect(screen.getByText("This grant is being reviewed, so its section guidance is hidden for now.")).toBeInTheDocument();
    expect(screen.queryByText("Why the project is needed.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Budget/ })).toBeInTheDocument();

    await user.type(editor, " and more");
    expect(editor).toHaveValue("My text and more");
    await waitFor(() => expect(updates(net).slice(-1)[0]?.sections).toMatchObject({ "statement-of-need": "My text and more" }));
  });

  it("shows the note only on the grant's own sections, not on one the applicant added", async () => {
    const order = [...ORDER, { id: "custom-partners", name: "Partners" }];
    stubServer({ row: { ...row, sections: { ...row.sections, "custom-partners": "Our partners" }, section_order: order } }, { inReview: true, ...GRANT });
    // jsdom has no layout, so it leaves scrollIntoView out.
    Element.prototype.scrollIntoView = vi.fn();
    const { user } = renderApp(<Editor />);

    await screen.findByRole("textbox", { name: "Statement of Need" });
    expect(screen.getByText(/section guidance is hidden/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Partners/ }));
    await screen.findByRole("textbox", { name: "Partners" });
    expect(screen.queryByText(/section guidance is hidden/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Budget/ }));
    await screen.findByRole("textbox", { name: "Budget" });
    expect(screen.getByText(/section guidance is hidden/)).toBeInTheDocument();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("shows the grant's guidance once it is out of review", async () => {
    stubServer({ row: { ...row } });
    renderApp(<Editor />);

    expect(await screen.findByText("Why the project is needed.")).toBeInTheDocument();
    expect(screen.queryByText(/section guidance is hidden/)).not.toBeInTheDocument();
  });
});

describe("SectionsEditor size", () => {
  it("warns once a save brings the application close to its storage limit", async () => {
    const fake: Fake = {
      row: { session_id: "s1", status: "editing_sections", sections: { budget: "x" }, section_order: ORDER, rev: 1 },
      itemBytes: 320_000,
    };
    stubServer(fake);
    const { user } = renderApp(<Editor />);

    const editor = await screen.findByRole("textbox", { name: "Statement of Need" });
    expect(screen.queryByText(/close to its size limit/)).not.toBeInTheDocument();
    await user.type(editor, "More");

    expect(await screen.findByText(/This application is close to its size limit/)).toBeInTheDocument();
  });
});
