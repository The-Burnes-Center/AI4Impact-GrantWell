import { screen } from "@testing-library/react";
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
    expect(markdown.textContent).toMatch(/js plain secure mail/);
    expect(markdown.innerHTML).not.toMatch(/javascript:|insecure\.example|evil\.example/);
  });
});
