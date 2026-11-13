import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import AnalyticsTab from "./AnalyticsTab";

const ANALYTICS = "GET /admin/analytics";

describe("AnalyticsTab filters", () => {
  it("labels the time period as a group of pressed toggles beside the state filter", async () => {
    const net = stubFetch({
      [ANALYTICS]: json({ message: "unavailable" }, 500),
      "GET /admin/application-outcomes": json({ outcomes: [] }),
    });
    const { user } = renderApp(
      <AnalyticsTab apiClient={testApiClient()} addNotification={vi.fn()} isStateAdmin={false} userState="" />
    );

    expect(screen.getByLabelText("Filter by state")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Time period" });
    expect(screen.getByText("Time period")).toBeVisible();
    const toggles = within(group).getAllByRole("button");
    expect(toggles.map((t) => [t.textContent, t.getAttribute("aria-pressed")])).toEqual([
      ["Last 7 days", "false"],
      ["Last 30 days", "true"],
      ["Last 90 days", "false"],
    ]);

    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-pressed", "true");
    expect(toggles[1]).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(net.last(ANALYTICS).url.searchParams.get("window")).toBe("7"));
  });
});
