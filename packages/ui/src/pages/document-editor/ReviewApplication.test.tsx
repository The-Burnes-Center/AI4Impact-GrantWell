import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import ReviewApplication from "./ReviewApplication";

const GRANT = { data: { GrantName: "Grant A", ProjectNarrativeSections: [{ item: "Budget", description: "Costs." }] } };

function renderReview(grantType: string | null) {
  const net = stubFetch({
    "GET /s3-nofo-summary": json(GRANT),
    "GET /s3-nofo-bucket-data": json({ nofoData: [{ name: "Grant A", grant_type: grantType }] }),
    "POST /user-draft": json({ session_id: "s1", sections: { Budget: "We need $10." }, status: "reviewing" }),
  });
  renderApp(<ReviewApplication selectedNofo="Grant A" sessionId="s1" onNavigate={() => {}} />);
  return net;
}

async function grantTypeLoaded(net: ReturnType<typeof stubFetch>) {
  await vi.waitFor(() => expect(net.to("GET /s3-nofo-bucket-data")).toHaveLength(1));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe("ReviewApplication after-export steps", () => {
  it("points a federal grant at grants.gov and the SF-424", async () => {
    await grantTypeLoaded(renderReview("federal"));
    expect(await screen.findByText("Submit the PDF through the official grants.gov portal")).toBeInTheDocument();
    expect(screen.getByText("Complete the SF-424 form separately (if required)")).toBeInTheDocument();
  });

  it.each(["state", "quasi", "philanthropic"])("points a %s grant at the funder's own process", async (type) => {
    await grantTypeLoaded(renderReview(type));
    expect(await screen.findByText(/Submit it through the funder's own application portal or process/)).toBeInTheDocument();
    expect(screen.getByText(/Key deadlines/)).toBeInTheDocument();
    expect(screen.queryByText(/grants\.gov/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SF-424/)).not.toBeInTheDocument();
  });
});

const ABSTRACT = "Our museum serves the whole city and its many visitors every day.";
const CHECKED_GRANT = {
  data: {
    GrantName: "Grant B",
    ProjectNarrativeSections: [
      { item: "Abstract", description: "An abstract of no more than 50 characters (including spaces)." },
      { item: "Project description", description: "Describe the project." },
      { item: "Work plan", description: "Up to 2 pages." },
      { item: "Budget justification", description: "Explain the costs." },
    ],
    RequiredDocuments: [{ item: "Project Narrative", description: "The narrative must not exceed 7 pages." }],
  },
};
const ORDER = [
  { id: "abstract", name: "Abstract" },
  { id: "project-description", name: "Project description" },
  { id: "work-plan", name: "Work plan" },
  { id: "budget-justification", name: "Budget justification" },
];

function renderChecked({ grant = CHECKED_GRANT, onNavigate = () => {} }: { grant?: unknown; onNavigate?: (step: string) => void } = {}) {
  localStorage.setItem("gw:draft:s1:sectionsViewed", JSON.stringify(["abstract", "project-description"]));
  const net = stubFetch({
    "GET /s3-nofo-summary": json(grant),
    "GET /s3-nofo-bucket-data": json({ nofoData: [{ name: "Grant B", grant_type: "state" }] }),
    "POST /user-draft": json({
      session_id: "s1",
      title: "Museum project",
      status: "reviewing",
      sections: {
        abstract: ABSTRACT,
        "project-description": "[LEAD APPLICANT NAME] will run the program in [CITY, STATE].",
        "work-plan": "We will start in spring.",
        "budget-justification": "",
      },
      section_order: ORDER,
      sectionOrder: ORDER,
    }),
    "POST /generate-docx": () =>
      new Response("PK", { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }),
  });
  const result = renderApp(<ReviewApplication selectedNofo="Grant B" sessionId="s1" onNavigate={onNavigate} />);
  return { net, ...result };
}

const sectionList = () => within(screen.getByRole("navigation", { name: "Sections" }));
const listLoaded = () => screen.findByRole("navigation", { name: "Sections" });

describe("ReviewApplication checks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives each section a short status in words", async () => {
    renderChecked();
    await listLoaded();
    expect(await sectionList().findByRole("button", { name: /^Abstract\s*,\s*Over limit$/ })).toHaveAttribute("aria-current", "true");
    expect(sectionList().getByRole("button", { name: /^Project description\s*,\s*2 to fill$/ })).not.toHaveAttribute("aria-current");
    expect(sectionList().getByRole("button", { name: /^Work plan\s*,\s*Not opened$/ })).toBeInTheDocument();
    expect(sectionList().getByRole("button", { name: /^Budget justification\s*,\s*Not drafted$/ })).toBeInTheDocument();
  });

  it("sums up the checks and the narrative pages against the grant's limit", async () => {
    renderChecked();
    expect(await screen.findByText("4 things to check · about 0.1 of 7 narrative pages")).toBeInTheDocument();
  });

  it("leaves the page estimate out when the grant states no narrative limit", async () => {
    renderChecked({ grant: { data: { ...CHECKED_GRANT.data, RequiredDocuments: [] } } });
    expect(await screen.findByText("4 things to check")).toBeInTheDocument();
  });

  it("shows an over-limit section's length against the grant's limit", async () => {
    renderChecked();
    expect(await screen.findByRole("heading", { name: "Abstract" })).toBeInTheDocument();
    expect(screen.getByText(`${ABSTRACT.length} of 50 characters, ${ABSTRACT.length - 50} over.`)).toBeInTheDocument();
    expect(screen.getByText(ABSTRACT)).toBeInTheDocument();
  });

  it("highlights placeholders and counts them for screen readers", async () => {
    const { user } = renderChecked();
    await listLoaded();
    await user.click(await sectionList().findByRole("button", { name: /Project description/ }));

    const preview = screen.getByRole("region", { name: "Project description" });
    expect(within(preview).getByText("2 placeholders to fill, highlighted below.")).toBeInTheDocument();
    const marks = preview.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["Placeholder: [LEAD APPLICANT NAME]", "Placeholder: [CITY, STATE]"]);
  });

  it("states no length for a section without a stated limit", async () => {
    const { user } = renderChecked();
    await listLoaded();
    await user.click(await sectionList().findByRole("button", { name: /Project description/ }));
    expect(screen.queryByText(/characters|words|pages\./)).not.toBeInTheDocument();
  });

  it("moves the preview and focus to a section chosen from the keyboard", async () => {
    const { user } = renderChecked();
    await listLoaded();
    const abstract = await sectionList().findByRole("button", { name: /Abstract/ });
    abstract.focus();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    const heading = screen.getByRole("heading", { name: "Work plan" });
    expect(heading).toHaveFocus();
    expect(sectionList().getByRole("button", { name: /Work plan/ })).toHaveAttribute("aria-current", "true");
    expect(abstract).not.toHaveAttribute("aria-current");
    expect(screen.getByText("About 0.1 of 2 pages.")).toBeInTheDocument();
  });

  it("counts a section chosen in Review as opened, and remembers it", async () => {
    const { user, unmount } = renderChecked();
    await listLoaded();
    expect(await screen.findByText(/^4 things to check/)).toBeInTheDocument();

    await user.click(sectionList().getByRole("button", { name: /^Work plan\s*,\s*Not opened$/ }));

    expect(sectionList().getByRole("button", { name: /^Work plan$/ })).toBeInTheDocument();
    expect(screen.queryByText(/not opened yet/)).not.toBeInTheDocument();
    expect(screen.getByText(/^3 things to check/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gw:draft:s1:sectionsViewed")!)).toContain("work-plan");

    unmount();
    renderApp(<ReviewApplication selectedNofo="Grant B" sessionId="s1" onNavigate={() => {}} />);
    await listLoaded();
    expect(await sectionList().findByRole("button", { name: /^Work plan$/ })).toBeInTheDocument();
  });

  it("sends Edit this section to that section in the Section editor", async () => {
    const onNavigate = vi.fn();
    const { user } = renderChecked({ onNavigate });
    await listLoaded();
    await user.click(await sectionList().findByRole("button", { name: /Work plan/ }));
    await user.click(screen.getByRole("button", { name: "Edit this section: Work plan" }));
    expect(onNavigate).toHaveBeenCalledWith("sectionEditor");
    expect(localStorage.getItem("gw:draft:s1:openSection")).toBe(JSON.stringify("work-plan"));
  });

  it("never blocks the download, whatever the checks find", async () => {
    vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:docx");
    vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { net, user } = renderChecked();
    await screen.findByText(/4 things to check/);

    const word = screen.getByRole("button", { name: "Download Word" });
    const pdf = screen.getByRole("button", { name: "Download PDF" });
    for (const button of [word, pdf]) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled");
    }

    await user.click(word);
    await waitFor(() => expect(net.to("POST /generate-docx")).toHaveLength(1));
    const body = net.last("POST /generate-docx").body as { draftData: { sections: Record<string, string> } };
    expect(Object.keys(body.draftData.sections)).toEqual(["abstract", "project-description", "work-plan"]);
    expect(await screen.findByText("Word document ready. Downloaded as grant-application.docx.")).toBeInTheDocument();
  });
});
