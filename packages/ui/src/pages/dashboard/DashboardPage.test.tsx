import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { json, stubFetch } from "../../test/fetch-routes";
import { instance } from "../../test/instance";
import { renderApp } from "../../test/render";
import Dashboard from "./DashboardPage";

const stub = vi.hoisted(() => (name: string) => ({ default: () => <p>{name} panel</p> }));
vi.mock("../../components/navigation/UnifiedNavigation", () => ({ default: (): null => null }));
vi.mock("./components/NOFOsTab", () => ({
  default: ({ nofos }: { nofos: { name: string }[] }) => (
    <>
      <p>Grants panel</p>
      <ul aria-label="Listed grants">
        {nofos.map((n) => (
          <li key={n.name}>{n.name}</li>
        ))}
      </ul>
    </>
  ),
}));
vi.mock("./components/ProcessingTab", () => stub("Processing"));
vi.mock("./components/ProcessingReviewTab", () => stub("Review"));
vi.mock("./components/AnalyticsTab", () => stub("Analytics"));
vi.mock("./components/FeatureRolloutsTab", () => stub("Feature rollouts"));
vi.mock("./components/UserManagementTab", () => stub("User management"));
vi.mock("./components/DigestPreviewTab", () => stub("Digest preview"));

const metrics = {
  totalProcessed: 0, successRate: 0, pendingCount: 0, failedCount: 0, approvedCount: 0,
  rejectedCount: 0, needsReuploadCount: 0, supersededCount: 0,
};

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  stubFetch({
    "GET /s3-nofo-bucket-data": json({ nofoData: [] }),
    "GET /admin/processing-metrics": json({ metrics }),
  });
});

function renderDashboard() {
  return renderApp(
    <Routes>
      <Route path="/admin" element={<Dashboard />} />
      <Route path="/home" element={<p>Home page</p>} />
    </Routes>,
    { route: "/admin" }
  );
}

const tabNames = async () => {
  await screen.findByRole("tablist", { name: "Admin Dashboard sections" });
  return screen.getAllByRole("tab").map((t) => t.textContent);
};

describe("Admin Dashboard tabs", () => {
  it("gives a state admin Grants, Analytics and User Management", async () => {
    signedInAs({ "custom:role": '["Admin"]', "custom:state": "MA" });
    renderDashboard();
    expect(await tabNames()).toEqual(["Grants", "Analytics", "User management"]);
  });

  it("shows Auto-scrape grants to a developer but not to a state admin on a multi-state site", async () => {
    signedInAs({ "custom:role": '["Admin"]', "custom:state": "MA" });
    const { unmount } = renderDashboard();
    await tabNames();
    expect(screen.queryByRole("button", { name: /Auto-scrape grants/ })).toBeNull();
    unmount();
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    await tabNames();
    expect(await screen.findByRole("button", { name: /Auto-scrape grants/ })).toBeTruthy();
  });

  it("adds Feature Rollouts and Digest Preview for a developer", async () => {
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    expect(await tabNames()).toEqual(["Grants", "Analytics", "Feature rollouts", "User management", "Digest preview"]);
  });

  it("drops Digest Preview on a deployment without digests", async () => {
    instance.EMAIL_DIGEST = false;
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    expect(await tabNames()).not.toContain("Digest preview");
  });

  it("sends a non-admin to /home", async () => {
    signedInAs({ "custom:role": '["User"]' });
    renderDashboard();
    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });

  it("moves between tabs with the arrow, Home and End keys, wrapping at the ends", async () => {
    signedInAs({ "custom:role": '["Admin"]', "custom:state": "MA" });
    const { user } = renderDashboard();
    await tabNames();
    const tab = (name: string) => screen.getByRole("tab", { name });

    await user.click(tab("Grants"));
    expect(screen.getByText("Grants panel")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tab("Analytics")).toHaveFocus();
    expect(tab("Analytics")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Analytics panel")).toBeInTheDocument();

    await user.keyboard("{End}");
    expect(tab("User management")).toHaveFocus();
    expect(screen.getByText("User management panel")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tab("Grants")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("User management")).toHaveFocus();
    expect(tab("Grants")).toHaveAttribute("tabindex", "-1");
  });
});

describe("Admin Dashboard grant list", () => {
  it("keeps a live grant listed while its new version runs or waits for review, and leaves new ones to Processing", async () => {
    stubFetch({
      "GET /s3-nofo-bucket-data": json({
        nofoData: [
          { name: "Live Grant", status: "active", processing_status: "checking_sources" },
          { name: "Waiting Grant", status: "active", processing_status: "quarantined" },
          { name: "New Grant", status: "processing", processing_status: "extracting_text" },
          { name: "Held Grant", status: "quarantined", processing_status: "quarantined" },
          { name: "Plain Grant", status: "active" },
        ],
      }),
      "GET /admin/processing-metrics": json({ metrics }),
    });
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();

    await screen.findByText("Plain Grant");
    const list = screen.getByRole("list", { name: "Listed grants" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Live Grant", "Plain Grant", "Waiting Grant"]);
  });
});
