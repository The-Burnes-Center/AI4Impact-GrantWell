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
vi.mock("./components/NOFOsTab", () => stub("Grants"));
vi.mock("./components/ProcessingTab", () => stub("Processing"));
vi.mock("./components/ProcessingReviewTab", () => stub("Review"));
vi.mock("./components/AnalyticsTab", () => stub("Analytics"));
vi.mock("./components/FeatureRolloutsTab", () => stub("Feature Rollouts"));
vi.mock("./components/UserManagementTab", () => stub("User Management"));
vi.mock("./components/DigestPreviewTab", () => stub("Digest Preview"));

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
    expect(await tabNames()).toEqual(["Grants", "Analytics", "User Management"]);
  });

  it("adds Feature Rollouts and Digest Preview for a developer", async () => {
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    expect(await tabNames()).toEqual(["Grants", "Analytics", "Feature Rollouts", "User Management", "Digest Preview"]);
  });

  it("drops Digest Preview on a deployment without digests", async () => {
    instance.EMAIL_DIGEST = false;
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    expect(await tabNames()).not.toContain("Digest Preview");
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
    expect(tab("User Management")).toHaveFocus();
    expect(screen.getByText("User Management panel")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tab("Grants")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("User Management")).toHaveFocus();
    expect(tab("Grants")).toHaveAttribute("tabindex", "-1");
  });
});
