import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch, type RouteRequest } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import { useDraftSave } from "../../hooks/use-draft-save";
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
          return json({ ...fake.row, sectionOrder: fake.row.section_order, rev: 2 });
        case "list_draft_versions":
          return json({ versions: [] });
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
