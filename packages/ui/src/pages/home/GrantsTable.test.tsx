import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { NOFO } from "../../common/types/nofo";
import type { AISearchResult } from "../../hooks/use-ai-grant-search";
import { GrantsTable } from "./GrantsTable";

const NOFOS: NOFO[] = [
  { id: 1, name: "Bridge Repair", status: "active", grantType: "state", category: "Transportation" },
  { id: 2, name: "Old Bridge Fund", status: "archived", grantType: "state", category: "Transportation" },
  { id: 3, name: "Bridge Arts", status: "active", grantType: "philanthropic", category: "Arts" },
  { id: 4, name: "Federal Bridges", status: "active", grantType: "federal", category: "Transportation" },
];

const RESULTS: AISearchResult[] = [
  { name: "Old Bridge Fund", score: 0.95, source: "hybrid", reason: "" },
  { name: "Bridge Arts", score: 0.9, source: "hybrid", reason: "" },
  { name: "Federal Bridges", score: 0.5, source: "hybrid", reason: "" },
  { name: "Bridge Repair", score: 0.7, source: "hybrid", reason: "" },
];

const table = (searchResults: AISearchResult[] | null) => (
  <GrantsTable nofos={NOFOS} loading={false} onSelectDocument={() => {}} searchTerm="bridge" searchResults={searchResults} />
);

const rowNames = () =>
  within(screen.getByRole("table", { name: "Grants" }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent?.trim());

describe("GrantsTable with AI search results", () => {
  it("keeps the user's filters, leaves out expired grants, and ranks the rest by score", async () => {
    const user = userEvent.setup();
    const { rerender } = render(table(null));
    await user.selectOptions(screen.getByLabelText("Category"), "Transportation");

    rerender(table(RESULTS));

    expect(screen.getByLabelText("Status")).toHaveValue("active");
    expect(screen.getByLabelText("Category")).toHaveValue("Transportation");
    const names = rowNames();
    expect(names).toHaveLength(2);
    expect(names[0]).toContain("Bridge Repair");
    expect(names[1]).toContain("Federal Bridges");
    expect(screen.getByText(/grants? matching/).textContent).toMatch(/^Found 2 grants matching/);

    await user.selectOptions(screen.getByLabelText("Grant Type"), "federal");
    expect(rowNames()).toEqual([expect.stringContaining("Federal Bridges")]);
    expect(screen.getByText(/grants? matching/).textContent).toMatch(/^Found 1 grant matching/);
  });

  it("shows expired matches once the user picks All, still in score order", async () => {
    const user = userEvent.setup();
    const { rerender } = render(table(null));
    rerender(table(RESULTS));
    expect(screen.getByText(/grants? matching/).textContent).toMatch(/^Found 3 grants matching/);

    await user.selectOptions(screen.getByLabelText("Status"), "all");
    const names = rowNames();
    expect(names).toHaveLength(4);
    expect(names[0]).toContain("Old Bridge Fund");
    expect(names[1]).toContain("Bridge Arts");
    expect(names[2]).toContain("Bridge Repair");
    expect(names[3]).toContain("Federal Bridges");
    expect(screen.getByText(/grants? matching/).textContent).toMatch(/^Found 4 grants matching/);
  });
});
