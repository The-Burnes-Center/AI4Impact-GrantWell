import { describe, expect, it } from "vitest";
import { outcomesCsv } from "./outcomes-csv";
import type { AdminOutcome } from "../../../common/api-client/outcomes-client";

const row = (o: Partial<AdminOutcome>): AdminOutcome => ({
  email: "jane@town.gov",
  deleted: false,
  organization: "Town of Lee",
  region: "Region 2",
  state: "CO",
  grant: "Broadband",
  title: "Fiber plan",
  status: "awarded",
  requestedAmount: "$40,000",
  amountAwarded: 40000,
  submittedDate: null,
  decisionDate: "2026-10-01",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...o,
});

describe("outcomesCsv", () => {
  it("writes a header and one row per outcome", () => {
    const [header, line] = outcomesCsv([row({})]).trimEnd().split("\r\n");
    expect(header).toBe("Email,Organization,Region,State,Grant,Application,Outcome,Requested amount,Amount awarded,Date submitted,Decision date,Last updated");
    expect(line).toBe('jane@town.gov,Town of Lee,Region 2,CO,Broadband,Fiber plan,Awarded,"$40,000",40000,,2026-10-01,2026-10-02T00:00:00.000Z');
  });

  it("quotes commas and quotes, defuses formulas, and marks deleted accounts", () => {
    const line = outcomesCsv([row({ deleted: true, email: "", title: 'Plan "A", phase 2', organization: "=HYPERLINK(1)" })]).split("\r\n")[1];
    expect(line.startsWith("(deleted account),'=HYPERLINK(1),")).toBe(true);
    expect(line).toContain('"Plan ""A"", phase 2"');
  });
});
