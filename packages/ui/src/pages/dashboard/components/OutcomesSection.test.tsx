import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import OutcomesSection from "./OutcomesSection";
import type { AdminOutcome } from "../../../common/api-client/outcomes-client";

const ADMIN = "GET /admin/application-outcomes";
const base: Pick<AdminOutcome, "organization" | "region" | "state" | "title" | "requestedAmount" | "submittedDate" | "decisionDate" | "updatedAt"> = { organization: "Town of Lee", region: "", state: "CO", title: "Plan", requestedAmount: "", submittedDate: null, decisionDate: null, updatedAt: "2026-10-01" };
const outcomes: AdminOutcome[] = [
  { ...base, email: "a@x.gov", deleted: false, grant: "Broadband", status: "awarded", amountAwarded: 40000, decisionDate: "2026-10-10" },
  { ...base, email: "b@x.gov", deleted: false, grant: "Transit", status: "submitted", amountAwarded: null },
  { ...base, email: "", deleted: true, grant: "Parks", status: "awarded", amountAwarded: 10000 },
];

function renderSection(state = "") {
  const net = stubFetch({ [ADMIN]: json({ outcomes }) });
  return { net, ...renderApp(<OutcomesSection apiClient={testApiClient()} state={state} addNotification={vi.fn()} />) };
}

describe("OutcomesSection", () => {
  it("sums outcomes and lists them, marking deleted accounts", async () => {
    renderSection();
    expect(await screen.findByLabelText("Total awarded: $50,000")).toBeInTheDocument();
    expect(screen.getByLabelText("Awarded: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Waiting to hear: 1")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Deleted account")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("filters by outcome and asks for the chosen state", async () => {
    const { net, user } = renderSection("CO");
    await screen.findByRole("table");
    expect(net.last(ADMIN).url.searchParams.get("state")).toBe("CO");
    await user.selectOptions(screen.getByLabelText("Filter by outcome"), "submitted");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Export CSV \(1 shown\)/ })).toBeEnabled();
  });
});
