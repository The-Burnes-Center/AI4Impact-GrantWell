import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import VersionHistoryPanel from "./VersionHistoryPanel";

const versions = [
  { rev: 3, created_at: "2026-10-03T00:00:00Z", source: "manual", total_word_count: 10 },
  { rev: 2, created_at: "2026-10-02T00:00:00Z", source: "manual", oversize: true },
  { rev: 1, created_at: "2026-10-01T00:00:00Z", source: "initial", total_word_count: 0 },
];

describe("VersionHistoryPanel", () => {
  it("moves through an oversize row with the arrow keys instead of stopping on it", async () => {
    const net = stubFetch({ "POST /user-draft": json({ versions }) });
    const { user } = renderApp(
      <VersionHistoryPanel
        isOpen
        onClose={() => {}}
        sessionId="s1"
        sections={[]}
        currentSections={{}}
        onRestored={() => {}}
      />
    );

    const rows = await screen.findAllByRole("button", { name: /words|cannot be restored|No text/ });
    expect(rows).toHaveLength(3);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close version history" })).toHaveFocus());
    rows[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(rows[1]).toHaveFocus();
    expect(rows[1]).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    expect(rows[2]).toHaveFocus();
    expect(net.to("POST /user-draft").every((r) => (r.body as { operation: string }).operation === "list_draft_versions")).toBe(true);
  });
});
