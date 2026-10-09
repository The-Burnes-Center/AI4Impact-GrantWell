import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManagedUser } from "../../../common/types/user-management";
import { json, stubFetch, type RouteRequest } from "../../../test/fetch-routes";
import { renderApp, testApiClient } from "../../../test/render";
import UserManagementTab from "./UserManagementTab";

const USERS = "GET /user-management/users";

const user = (n: number): ManagedUser => ({
  username: `u${n}`,
  email: `person${n}@example.org`,
  status: "CONFIRMED",
  enabled: true,
  roles: [],
  state: "",
});

function renderTab() {
  const addNotification = vi.fn();
  const view = renderApp(
    <UserManagementTab
      apiClient={testApiClient()}
      addNotification={addNotification}
      canAssignDeveloper={false}
      isStateAdmin={false}
      userState=""
      currentUsername="u0"
    />
  );
  return { addNotification, ...view };
}

const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("UserManagementTab", () => {
  it("shows the server's reason when users fail to load", async () => {
    stubFetch({ [USERS]: json({ message: "Internal server error" }, 502) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { addNotification } = renderTab();
    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith("error", "Failed to load users: Internal server error")
    );
  });

  it("pages forward with the server's token and back without one", async () => {
    const pages: Record<string, Response> = {
      "": json({ users: [user(1), user(2)], nextPaginationToken: "page-2", pageSize: 25 }),
      "page-2": json({ users: [user(3)], nextPaginationToken: null, pageSize: 25 }),
    };
    const net = stubFetch({
      [USERS]: (req: RouteRequest) => pages[req.url.searchParams.get("paginationToken") ?? ""].clone(),
    });
    const { user: ui } = renderTab();

    expect(await screen.findByText("person1@example.org")).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("person3@example.org")).toBeInTheDocument();
    expect(screen.getByText("Showing 26 to 26 users on page 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await ui.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("person1@example.org")).toBeInTheDocument();
    expect(net.to(USERS).map((c) => c.url.searchParams.get("paginationToken"))).toEqual([null, "page-2", null]);
  });

  it("searches from page 1, says how many matched, and clears back to the full list", async () => {
    const net = stubFetch({
      [USERS]: (req: RouteRequest) =>
        req.url.searchParams.get("query")
          ? json({ users: [user(7)], nextPaginationToken: null, pageSize: 25 })
          : json({ users: [user(1), user(2)], nextPaginationToken: "page-2", pageSize: 25 }),
    });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");

    await ui.type(screen.getByRole("searchbox", { name: "Search users" }), " person7 ");
    await ui.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText('1 user found for "person7".')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();

    const searchCall = net.last(USERS);
    expect(searchCall.url.searchParams.get("query")).toBe("person7");
    expect(searchCall.url.searchParams.get("paginationToken")).toBeNull();

    await ui.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });

  it("goes back to page 1 when the page size changes", async () => {
    const net = stubFetch({
      [USERS]: json({ users: [user(1)], nextPaginationToken: "page-2", pageSize: 25 }),
    });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");
    await ui.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(net.to(USERS)).toHaveLength(2));

    await ui.selectOptions(screen.getByLabelText("Items per page:"), "50");
    await waitFor(() => expect(net.to(USERS)).toHaveLength(3));
    const last = net.last(USERS).url.searchParams;
    expect(last.get("limit")).toBe("50");
    expect(last.get("paginationToken")).toBeNull();
  });

  it("shows Save only on a row you've changed, and no menu on your own row", async () => {
    stubFetch({ [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }) });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");

    expect(screen.queryByRole("button", { name: /^Save changes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for person0@example.org" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for person1@example.org" })).toBeInTheDocument();

    await ui.selectOptions(screen.getByLabelText("Role for person1@example.org"), "admin");
    expect(screen.getByRole("button", { name: "Save changes for person1@example.org" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes for person0@example.org" })).not.toBeInTheDocument();
  });

  it("keeps Reset two-step verification and Delete in the row's menu, each behind its confirmation", async () => {
    stubFetch({ [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }) });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");

    await ui.click(screen.getByRole("button", { name: "More actions for person1@example.org" }));
    const menu = await screen.findByRole("menu", { name: "More actions for person1@example.org" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Reset two-step verification",
      "Delete",
    ]);
    await waitFor(() => expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus());

    await ui.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Delete User" })).toBeInTheDocument();
  });
});
