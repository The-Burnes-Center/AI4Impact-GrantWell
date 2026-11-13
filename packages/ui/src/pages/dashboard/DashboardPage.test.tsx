import { act, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { json, stubFetch } from "../../test/fetch-routes";
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
vi.mock("./components/DocumentReviewsTab", () => stub("Document reviews"));

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
  await screen.findByRole("tablist", { name: "Admin dashboard sections" });
  return screen.getAllByRole("tab").map((t) => t.textContent);
};

describe("Admin dashboard tabs", () => {
  it("gives a state admin Grants, Analytics, User Management and Document reviews", async () => {
    signedInAs({ "custom:role": '["Admin"]', "custom:state": "MA" });
    renderDashboard();
    expect(await tabNames()).toEqual(["Grants", "Analytics", "User management", "Document reviews"]);
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

  it("adds Feature Rollouts for a developer, and no Digest preview tab", async () => {
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    expect(await tabNames()).toEqual(["Grants", "Analytics", "Feature rollouts", "User management", "Document reviews"]);
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
    expect(tab("Document reviews")).toHaveFocus();
    expect(screen.getByText("Document reviews panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Document reviews" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(tab("Grants")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("Document reviews")).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(tab("User management")).toHaveFocus();
    expect(screen.getByText("User management panel")).toBeInTheDocument();
    expect(tab("Grants")).toHaveAttribute("tabindex", "-1");
  });
});

describe("Admin dashboard grant list", () => {
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

describe("Admin dashboard grant filters", () => {
  it("filters with labelled Status and Grant type dropdowns above the table", async () => {
    stubFetch({
      "GET /s3-nofo-bucket-data": json({
        nofoData: [
          { name: "Fed Grant", status: "active", grant_type: "federal" },
          { name: "State Grant", status: "active", grant_type: "state" },
          { name: "Old Grant", status: "archived", grant_type: "federal" },
        ],
      }),
      "GET /admin/processing-metrics": json({ metrics }),
    });
    signedInAs({ "custom:role": '["Developer"]' });
    const { user } = renderDashboard();
    await screen.findByText("Fed Grant");
    const listed = () => [...screen.getByRole("list", { name: "Listed grants" }).querySelectorAll("li")].map((li) => li.textContent);

    expect(screen.getByRole("heading", { level: 2, name: "Grants" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filter grants/ })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("active");
    expect(listed()).toEqual(["Fed Grant", "State Grant"]);

    await user.selectOptions(screen.getByRole("combobox", { name: "Grant type" }), "federal");
    expect(listed()).toEqual(["Fed Grant"]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "all");
    expect(listed()).toEqual(["Fed Grant", "Old Grant"]);
  });
});

describe("Admin dashboard Refresh", () => {
  it("announces Refreshing from a status region already in the page, and not on the first load", async () => {
    let hold = false;
    let release = () => {};
    stubFetch({
      "GET /s3-nofo-bucket-data": () =>
        hold
          ? new Promise<Response>((resolve) => { release = () => resolve(json({ nofoData: [] })); })
          : json({ nofoData: [] }),
      "GET /admin/processing-metrics": json({ metrics }),
    });
    signedInAs({ "custom:role": '["Developer"]' });
    const { user } = renderDashboard();
    const refresh = await screen.findByRole("button", { name: /^Refresh/ });
    const statuses = () => screen.getAllByRole("status").map((r) => r.textContent);
    await new Promise((r) => setTimeout(r, 150));
    expect(statuses()).not.toContain("Refreshing Admin dashboard");

    hold = true;
    await user.click(refresh);
    await waitFor(() => expect(statuses()).toContain("Refreshing Admin dashboard"));
    expect(refresh).toHaveFocus();
    release();
    await waitFor(() => expect(statuses()).not.toContain("Refreshing Admin dashboard"));
  });
});

describe("Admin dashboard auto-refresh", () => {
  const processing = { name: "New Grant", status: "processing", processing_status: "extracting_text" };
  const done = { name: "New Grant", status: "active" };

  function stubPoll() {
    let grants: object[] = [processing];
    stubFetch({
      "GET /s3-nofo-bucket-data": () => json({ nofoData: grants }),
      "GET /admin/processing-metrics": json({ metrics }),
    });
    return { finish: () => { grants = [done]; } };
  }

  async function pollOnce() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
  }

  it("swaps the Pause label instead of also reporting a pressed state", async () => {
    stubPoll();
    signedInAs({ "custom:role": '["Developer"]' });
    const { user } = renderDashboard();
    const pause = await screen.findByRole("button", { name: "Pause auto-refresh" });
    expect(pause).not.toHaveAttribute("aria-pressed");
    await user.click(pause);
    expect(screen.getByRole("button", { name: "Resume auto-refresh" })).not.toHaveAttribute("aria-pressed");
  });

  it("moves focus from Pause to Refresh when a poll sees processing end", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const poll = stubPoll();
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    const pause = await screen.findByRole("button", { name: "Pause auto-refresh" });
    act(() => pause.focus());

    poll.finish();
    await pollOnce();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Pause auto-refresh" })).toBeNull());
    expect(screen.getByRole("button", { name: /^Refresh/ })).toHaveFocus();
  });

  it("moves focus from the processing banner to the grant search when the banner goes away", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const poll = stubPoll();
    signedInAs({ "custom:role": '["Developer"]' });
    renderDashboard();
    const view = await screen.findByRole("button", { name: "View" });
    act(() => view.focus());

    poll.finish();
    await pollOnce();

    await waitFor(() => expect(screen.queryByRole("button", { name: "View" })).toBeNull());
    expect(screen.getByRole("textbox", { name: "Search grants" })).toHaveFocus();
  });

  it("leaves focus alone when it was elsewhere", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const poll = stubPoll();
    signedInAs({ "custom:role": '["Developer"]' });
    const { user } = renderDashboard();
    const pause = await screen.findByRole("button", { name: "Pause auto-refresh" });
    act(() => pause.focus());
    await user.tab();
    const elsewhere = document.activeElement;

    poll.finish();
    await pollOnce();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Pause auto-refresh" })).toBeNull());
    expect(document.activeElement).toBe(elsewhere);
  });
});
