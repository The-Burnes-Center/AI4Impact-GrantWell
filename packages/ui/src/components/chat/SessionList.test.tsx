import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import { NotificationProvider } from "../notifications/NotificationManager";
import SessionList from "./SessionList";

const sessions = Array.from({ length: 25 }, (_, i) => ({
  session_id: `s${i}`,
  title: `Chat ${i + 1}`,
  time_stamp: new Date(Date.UTC(2026, 9, 25 - i)).toISOString(),
}));

function renderList() {
  stubFetch({ "POST /user-session": json(sessions) });
  return renderApp(
    <NotificationProvider>
      <SessionList toolsOpen={false} documentIdentifier={null} />
    </NotificationProvider>
  );
}

describe("SessionList", () => {
  it("names the select column Select, apart from its Select all checkbox", async () => {
    renderList();
    const selectAll = await screen.findByRole("checkbox", { name: "Select all chats" });
    const header = screen.getByRole("columnheader", { name: "Select" });
    expect(header).toContainElement(selectAll);
    expect(screen.queryByText("Select", { selector: ".visually-hidden" })).toBeNull();
  });

  it("announces the shown range when the page changes", async () => {
    const { user } = renderList();
    const range = await screen.findByText("Showing 1 to 20 of 25 chats");
    expect(range).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(range).toHaveTextContent("Showing 21 to 25 of 25 chats");
    expect(within(screen.getByRole("table", { name: "Chats" })).getAllByRole("row")).toHaveLength(6);
  });
});
