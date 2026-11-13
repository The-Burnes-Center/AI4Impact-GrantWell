import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { signedInAs } from "../../test/amplify";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import HomePage from "./HomePage";

vi.mock("./GrantsTable", () => ({
  GrantsTable: ({ nofos }: { nofos: { name: string }[] }) => (
    <ul aria-label="Home grants">
      {nofos.map((n) => (
        <li key={n.name}>{n.name}</li>
      ))}
    </ul>
  ),
}));
vi.mock("../../components/search/IntegratedSearchBar", () => ({ default: (): null => null }));
vi.mock("./components/HistoryPanel", () => ({ default: (): null => null }));
vi.mock("./components/AboutPanel", () => ({ default: (): null => null }));
vi.mock("./components/ResourcesPanel", () => ({ default: (): null => null }));
vi.mock("./components/FeedbackForm", () => ({ default: (): null => null }));
vi.mock("../../hooks/use-feature-rollout-access", () => ({
  useFeatureRolloutAccess: () => ({ access: null as null, loading: false, refresh: async () => {} }),
}));

describe("HomePage grant list", () => {
  it("keeps a live grant listed while a new version of it is processed, and leaves out held grants", async () => {
    signedInAs({ "custom:role": '["User"]', "custom:state": "MA" });
    stubFetch({
      "GET /s3-nofo-bucket-data": json({
        nofoData: [
          { name: "Rerun Grant", status: "active", processing_status: "checking_sources" },
          { name: "Waiting Grant", status: "archived", processing_status: "quarantined" },
          { name: "Plain Grant", status: "active" },
          { name: "New Grant", status: "processing", processing_status: "extracting_text" },
          { name: "Held Grant", status: "quarantined", processing_status: "quarantined" },
        ],
      }),
    });
    renderApp(<HomePage />);

    await screen.findByText("Plain Grant");
    const list = screen.getByRole("list", { name: "Home grants" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Plain Grant", "Rerun Grant", "Waiting Grant"]);
  });
});
