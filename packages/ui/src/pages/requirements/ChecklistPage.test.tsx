import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import ChecklistPage from "./ChecklistPage";

vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));

const DESCRIPTION =
  "![logo](https://evil.example/pixel.png) [js](javascript:alert(1)) [plain](http://insecure.example) " +
  "[secure](https://grants.gov/x) [mail](mailto:help@example.org)";

describe("ChecklistPage grant summary", () => {
  it("shows image alt text instead of loading images and keeps only https and mailto links", async () => {
    localStorage.setItem("checklistsHelpSeen", "true");
    stubFetch({
      "GET /s3-nofo-summary": json({
        data: {
          GrantName: "Grant A",
          EligibilityCriteria: [{ item: "Cities", description: DESCRIPTION }],
          RequiredDocuments: [],
          ProjectNarrativeSections: [],
          KeyDeadlines: [],
        },
      }),
      "GET /s3-nofo-bucket-data": json({ nofoData: [] }),
    });

    const { container } = renderApp(
      <Routes>
        <Route path="/requirements/:documentIdentifier" element={<ChecklistPage />} />
      </Routes>,
      { route: "/requirements/Grant%20A" }
    );

    expect(await screen.findByText("secure")).toBeInTheDocument();
    const markdown = container.querySelector(".checklist-tabs__markdown")!;
    expect(markdown.querySelector("img")).toBeNull();
    expect(screen.getByText(/logo/)).toBeInTheDocument();

    const links = [...markdown.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://grants.gov/x", "mailto:help@example.org"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(markdown.textContent).toMatch(/js plain secure \(opens in new tab\) mail/);
    expect(markdown.innerHTML).not.toMatch(/javascript:|insecure\.example|evil\.example/);
    expect(screen.getByRole("heading", { level: 2, name: "Not sure if your organization qualifies?" })).toBeInTheDocument();
  });
});

const SUMMARY = {
  data: {
    GrantName: "Grant A",
    EligibilityCriteria: [{ item: "Cities", description: "Any city." }],
    RequiredDocuments: [{ item: "Budget", description: "A budget." }],
    ProjectNarrativeSections: [] as unknown[],
    KeyDeadlines: [] as unknown[],
  },
};

function renderChecklist(summary: Response, nofos: Response = json({ nofoData: [{ name: "Grant A", grant_type: "state" }] })) {
  localStorage.setItem("checklistsHelpSeen", "true");
  stubFetch({ "GET /s3-nofo-summary": summary, "GET /s3-nofo-bucket-data": nofos });
  return renderApp(
    <Routes>
      <Route path="/requirements/:documentIdentifier" element={<ChecklistPage />} />
    </Routes>,
    { route: "/requirements/Grant%20A" }
  );
}

describe("ChecklistPage missing grant", () => {
  it.each([
    ["403 ACCESS_DENIED_STATE", json({ error: "ACCESS_DENIED_STATE", message: "We couldn't confirm your access." }, 403)],
    ["404", json({ message: "Not found" }, 404)],
  ])("says the grant can't be found on a %s, with a Home link", async (_label, summary) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderChecklist(summary, json({ nofoData: [] }));
    expect(await screen.findByRole("heading", { level: 1, name: "Grant not found" })).toBeInTheDocument();
    expect(screen.getByText("We couldn't find this grant. It may have been removed, or the link is wrong.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/home");
    expect(screen.queryByText(/Please try again/)).not.toBeInTheDocument();
  });

  it("says the grant can't be found when a 500 comes for a grant that isn't listed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderChecklist(json({}, 500), json({ nofoData: [{ name: "Grant B" }] }));
    expect(await screen.findByRole("heading", { level: 1, name: "Grant not found" })).toBeInTheDocument();
  });

  it("says a grant in review will be back soon, with a Home link and no retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderChecklist(
      json({ error: "GRANT_IN_REVIEW", message: "This grant is being reviewed and will be back soon." }, 409)
    );
    expect(await screen.findByRole("heading", { level: 1, name: "This grant isn't available right now" })).toBeInTheDocument();
    expect(screen.getByText("This grant is being reviewed and will be back soon.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/home");
    expect(screen.queryByText("Grant not found")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the retry message for a server error on a listed grant", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderChecklist(json({}, 500));
    expect(await screen.findByRole("heading", { level: 1, name: "Unable to load requirements" })).toBeInTheDocument();
    expect(screen.getByText("Failed to load grant requirements. Please try again.")).toBeInTheDocument();
  });
});

describe("ChecklistPage heading and tabs", () => {
  it("keeps the grant type badge apart from the grant name in the heading", async () => {
    renderChecklist(json(SUMMARY));
    await screen.findByRole("tab", { name: "Eligibility" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("Requirements for Grant A, State");
  });

  it("moves focus with the selection on Arrow, Home and End keys", async () => {
    const { user } = renderChecklist(json(SUMMARY));
    const eligibility = await screen.findByRole("tab", { name: "Eligibility" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);

    await user.click(eligibility);
    await user.keyboard("{ArrowRight}");
    const documents = screen.getByRole("tab", { name: "Required documents" });
    await waitFor(() => expect(documents).toHaveFocus());
    expect(documents).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1]);

    await user.keyboard("{End}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Key deadlines" })).toHaveFocus());
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(eligibility).toHaveFocus());
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Key deadlines" })).toHaveFocus());
    await user.keyboard("{Home}");
    await waitFor(() => expect(eligibility).toHaveFocus());
    expect(eligibility).toHaveAttribute("aria-selected", "true");
  });
});

describe("ChecklistPage requirement citations", () => {
  it("asks for citations and puts a quote button after each cited requirement", async () => {
    localStorage.setItem("checklistsHelpSeen", "true");
    const { calls } = stubFetch({
      "GET /s3-nofo-summary": json({
        data: {
          GrantName: "Grant A",
          EligibilityCriteria: [
            { item: "Cities", description: "Any city may apply.", citations: [{ quote: "Eligible applicants are cities.", page: 4, lastPage: 4 }] },
            { item: "Match", description: "A 20% match." },
          ],
          RequiredDocuments: [],
          ProjectNarrativeSections: [],
          KeyDeadlines: [],
        },
      }),
      "GET /s3-nofo-bucket-data": json({ nofoData: [] }),
    });

    const { user } = renderApp(
      <Routes>
        <Route path="/requirements/:documentIdentifier" element={<ChecklistPage />} />
      </Routes>,
      { route: "/requirements/Grant%20A" }
    );

    const button = await screen.findByRole("button", { name: "Quote 1, Grant document, page 4" });
    expect(screen.getAllByRole("button", { name: /^Quote/ })).toHaveLength(1);
    expect(button.closest("li")?.textContent).toMatch(/^Cities: Any city may apply\.1$/);
    await user.click(button);
    expect(screen.getByText("“Eligible applicants are cities.”")).toBeInTheDocument();
    const summary = calls.find((c) => c.url.pathname === "/s3-nofo-summary");
    expect(summary?.url.searchParams.get("citations")).toBe("1");
  });
});
