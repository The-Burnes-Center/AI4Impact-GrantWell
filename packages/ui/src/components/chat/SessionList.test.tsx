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
  it("keeps Select all out of the column headers, so rows are not announced with it", async () => {
    renderList();
    const selectAll = await screen.findByRole("checkbox", { name: "Select all chats" });
    expect(selectAll.closest("th")).toBeNull();
    expect(selectAll.closest("td")).not.toBeNull();
  });

  it("keeps Delete focusable while nothing is selected, without opening the dialog", async () => {
    const { user } = renderList();
    await screen.findByText("Chat 1");
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toBeEnabled();
    expect(del).toHaveAttribute("aria-disabled", "true");
    del.focus();
    expect(del).toHaveFocus();
    await user.click(del);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /^Select Chat 1,/ }));
    expect(del).not.toHaveAttribute("aria-disabled");
  });

  it("marks the sorted column and keeps the others sortable", async () => {
    const { user } = renderList();
    await screen.findByText("Chat 1");
    const title = screen.getByRole("columnheader", { name: "Title" });
    expect(screen.getByRole("columnheader", { name: "Time" })).toHaveAttribute("aria-sort", "descending");
    expect(title).toHaveAttribute("aria-sort", "none");

    await user.click(within(title).getByRole("button", { name: "Title" }));
    expect(title).toHaveAttribute("aria-sort", "ascending");
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
