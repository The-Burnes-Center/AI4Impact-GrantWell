import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManagedUser } from "../../../common/types/user-management";
import { json, stubFetch } from "../../../test/fetch-routes";
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

const member = (n: number): ManagedUser => ({ ...user(n), email: `p${String(n).padStart(3, "0")}@example.org` });
const members = (count: number) => Array.from({ length: count }, (_, i) => member(i + 1));
const listed = (users: ManagedUser[], extra: Record<string, unknown> = {}) =>
  json({ users, nextPaginationToken: null, pageSize: users.length, ...extra });

function renderTab({ canAssignDeveloper = false, stateAdmin = "" } = {}) {
  const addNotification = vi.fn();
  const view = renderApp(
    <UserManagementTab
      apiClient={testApiClient()}
      addNotification={addNotification}
      canAssignDeveloper={canAssignDeveloper}
      isStateAdmin={Boolean(stateAdmin)}
      userState={stateAdmin}
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

  it("loads every user once and pages through them in email order", async () => {
    const net = stubFetch({ [USERS]: listed([...members(60)].reverse()) });
    const { user: ui } = renderTab();

    expect(await screen.findByText("p001@example.org")).toBeInTheDocument();
    expect(rows()).toHaveLength(25);
    expect(screen.getByText("Showing 1 to 25 of 60 users")).toBeInTheDocument();
    expect(within(rows()[24]).getByText("p025@example.org")).toBeInTheDocument();

    await ui.click(screen.getByRole("button", { name: "Go to page 3" }));
    expect(rows().map((r) => within(r).getAllByText(/@example\.org$/)[0].textContent)).toEqual(
      Array.from({ length: 10 }, (_, i) => `p0${51 + i}@example.org`)
    );
    expect(screen.getByText("Showing 51 to 60 of 60 users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Go to page 3" })).toHaveAttribute("aria-current", "page");

    await ui.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Showing 26 to 50 of 60 users")).toBeInTheDocument();
    expect(net.to(USERS)).toHaveLength(1);
    expect(net.last(USERS).url.search).toBe("");
  });

  it("searches the loaded list from page 1, says how many matched, and clears back to the full list", async () => {
    const net = stubFetch({ [USERS]: listed([...members(40), { ...user(7), email: "seven@example.org", username: "person7" }]) });
    const { user: ui } = renderTab();
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Next page" }));

    await ui.type(screen.getByRole("searchbox", { name: "Search users" }), " PERSON7 ");
    await ui.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText('1 user found for "PERSON7".')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Showing 1 to 1 of 1 users")).toBeInTheDocument();
    expect(net.to(USERS)).toHaveLength(1);

    await ui.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(rows()).toHaveLength(25));
    expect(screen.getByText("Showing 1 to 25 of 41 users")).toBeInTheDocument();
  });

  it("goes back to page 1 when the page size changes", async () => {
    stubFetch({ [USERS]: listed(members(120)) });
    const { user: ui } = renderTab();
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Go to page 2" }));

    await ui.selectOptions(screen.getByLabelText("Items per page:"), "100");
    expect(rows()).toHaveLength(100);
    expect(screen.getByText("Showing 1 to 100 of 120 users")).toBeInTheDocument();
  });

  it("stays on the same page after deleting a user, without reloading the list", async () => {
    const net = stubFetch({
      [USERS]: listed(members(30)),
      "DELETE /user-management/users/u27": json({ username: "u27", deleted: true }),
    });
    const { user: ui } = renderTab();
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Next page" }));

    await ui.click(screen.getByRole("button", { name: "More actions for p027@example.org" }));
    await ui.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await ui.click(within(await screen.findByRole("dialog", { name: "Delete user" })).getByRole("button", { name: "Delete user" }));

    await waitFor(() => expect(screen.queryByText("p027@example.org")).not.toBeInTheDocument());
    expect(screen.getByText("Showing 26 to 29 of 29 users")).toBeInTheDocument();
    expect(net.to(USERS)).toHaveLength(1);
  });

  it("goes back a page when deleting the only user on the last page", async () => {
    stubFetch({
      [USERS]: listed(members(26)),
      "DELETE /user-management/users/u26": json({ username: "u26", deleted: true }),
    });
    const { user: ui } = renderTab();
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Next page" }));
    await ui.click(screen.getByRole("button", { name: "More actions for p026@example.org" }));
    await ui.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await ui.click(within(await screen.findByRole("dialog", { name: "Delete user" })).getByRole("button", { name: "Delete user" }));

    expect(await screen.findByText("Showing 1 to 25 of 25 users")).toBeInTheDocument();
    expect(rows()).toHaveLength(25);
  });

  it("reloads after inviting and opens the page with the new user", async () => {
    let created = false;
    const net = stubFetch({
      [USERS]: () => listed(created ? [...members(30), { ...user(99), email: "p0275@example.org" }] : members(30)),
      "POST /user-management/users": () => {
        created = true;
        return json({ username: "u99", email: "p0275@example.org" }, 201);
      },
    });
    const { user: ui } = renderTab();
    await screen.findByText("p001@example.org");

    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await ui.type(within(dialog).getByLabelText("Email address"), "P0275@example.org");
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));

    expect(await screen.findByText("p0275@example.org")).toBeInTheDocument();
    expect(screen.getByText("Showing 26 to 31 of 31 users")).toBeInTheDocument();
    expect(net.to(USERS)).toHaveLength(2);
  });

  it("offers only the roles the inviter may assign", async () => {
    stubFetch({ [USERS]: listed([member(1)]) });
    const view = renderTab();
    await screen.findByText("p001@example.org");
    await view.user.click(screen.getByRole("button", { name: "Invite user" }));
    let dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    const options = (d: HTMLElement) => within(within(d).getByLabelText("Role")).getAllByRole("option").map((o) => o.textContent);
    expect(options(dialog)).toEqual(["User", "Admin"]);
    view.unmount();

    stubFetch({ [USERS]: listed([member(1)]) });
    const dev = renderTab({ canAssignDeveloper: true });
    await screen.findByText("p001@example.org");
    await dev.user.click(screen.getByRole("button", { name: "Invite user" }));
    dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    expect(options(dialog)).toEqual(["User", "Admin", "Platform admin", "Developer"]);
  });

  it("needs a state for an invited admin, says so at the field, and sends the role", async () => {
    const net = stubFetch({
      [USERS]: listed([member(1)]),
      "POST /user-management/users": json({ username: "u9", email: "new@example.org" }, 201),
    });
    const { user: ui, addNotification } = renderTab();
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await ui.type(within(dialog).getByLabelText("Email address"), "new@example.org");
    await ui.selectOptions(within(dialog).getByLabelText("Role"), "admin");
    const state = within(dialog).getByLabelText("State");
    expect(state).toHaveAttribute("aria-required", "true");

    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    expect(state).toHaveAttribute("aria-invalid", "true");
    expect(state).toHaveAccessibleDescription("Choose a state for an admin.");
    expect(state).toHaveFocus();
    expect(net.to("POST /user-management/users")).toHaveLength(0);

    await ui.selectOptions(state, "MA");
    expect(state).not.toHaveAttribute("aria-invalid");
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith("success", "Invitation sent to new@example.org."));
    expect(net.last("POST /user-management/users").body).toEqual({ email: "new@example.org", state: "MA", rolePreset: "admin" });
  });

  it("invites a platform admin with no state", async () => {
    const net = stubFetch({
      [USERS]: listed([member(1)]),
      "POST /user-management/users": json({ username: "u9" }, 201),
    });
    const { user: ui } = renderTab({ canAssignDeveloper: true });
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await ui.type(within(dialog).getByLabelText("Email address"), "pa@example.org");
    await ui.selectOptions(within(dialog).getByLabelText("State (optional)"), "MA");
    await ui.selectOptions(within(dialog).getByLabelText("Role"), "platformadmin");
    const state = within(dialog).getByLabelText("State (optional)");
    expect(state).toBeDisabled();
    expect(state).toHaveValue("");
    expect(state).toHaveAccessibleDescription("Platform admins aren't tied to a state.");
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    await waitFor(() => expect(net.to("POST /user-management/users")).toHaveLength(1));
    expect(net.last("POST /user-management/users").body).toEqual({ email: "pa@example.org", rolePreset: "platformadmin" });
  });

  it("lets a state admin invite an admin into their own state", async () => {
    const net = stubFetch({
      [USERS]: listed([{ ...member(1), state: "MA" }]),
      "POST /user-management/users": json({ username: "u9" }, 201),
    });
    const { user: ui } = renderTab({ stateAdmin: "MA" });
    await screen.findByText("p001@example.org");
    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    expect(within(within(dialog).getByLabelText("Role")).getAllByRole("option").map((o) => o.textContent)).toEqual(["User", "Admin"]);
    expect(within(dialog).getByLabelText("State")).toHaveAccessibleDescription(/added to your state \(MA\)/);
    await ui.type(within(dialog).getByLabelText("Email address"), "ma@example.org");
    await ui.selectOptions(within(dialog).getByLabelText("Role"), "admin");
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    await waitFor(() => expect(net.to("POST /user-management/users")).toHaveLength(1));
    expect(net.last("POST /user-management/users").body).toEqual({ email: "ma@example.org", rolePreset: "admin" });
  });

  it("warns when the server stopped before the end of the user pool", async () => {
    stubFetch({ [USERS]: listed(members(3), { truncated: true }) });
    renderTab();
    expect(await screen.findByText(/stops at the first 3 accounts/)).toBeInTheDocument();
  });

  it("labels each account's status in words", async () => {
    stubFetch({
      [USERS]: listed([
        { ...member(1), status: "CONFIRMED" },
        { ...member(2), status: "FORCE_CHANGE_PASSWORD" },
        { ...member(3), enabled: false },
        { ...member(4), status: "RESET_REQUIRED" },
      ]),
    });
    renderTab();
    await screen.findByText("p001@example.org");
    expect(rows().map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "Active",
      "Invited",
      "Disabled",
      "Password reset required",
    ]);
  });

  it("names an account without an email by its username", async () => {
    stubFetch({ [USERS]: listed([member(1), { ...user(2), email: "", username: "ext-2" }]) });
    renderTab();
    expect(await screen.findByText("No email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for ext-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for ext-2" })).toBeInTheDocument();
  });

  it("locks developer and platform admin rows for an admin who isn't a developer, and flags a stateless admin", async () => {
    const accounts = [
      { ...member(1), roles: ["Developer"] },
      { ...member(2), roles: ["PlatformAdmin"] },
      { ...member(3), roles: ["Admin"] },
      { ...member(4), roles: ["Admin"], state: "MA" },
    ];
    stubFetch({ [USERS]: listed(accounts) });
    const view = renderTab();
    await screen.findByText("p001@example.org");

    for (const n of ["001", "002"]) {
      expect(screen.getByLabelText(`Role for p${n}@example.org`)).toBeDisabled();
      expect(screen.getByLabelText(`Role for p${n}@example.org`)).toHaveAccessibleDescription("Only a developer can change this account.");
      expect(screen.queryByRole("button", { name: `More actions for p${n}@example.org` })).not.toBeInTheDocument();
    }
    expect(screen.getByLabelText("Role for p003@example.org")).toBeEnabled();
    expect(screen.getByLabelText("Role for p003@example.org")).toHaveAccessibleDescription(
      "No state, so this admin has platform admin access."
    );
    expect(screen.getByLabelText("Role for p004@example.org")).not.toHaveAccessibleDescription();

    view.unmount();
    stubFetch({ [USERS]: listed(accounts) });
    renderTab({ canAssignDeveloper: true });
    await screen.findByText("p001@example.org");
    expect(screen.getByLabelText("Role for p001@example.org")).toBeEnabled();
    expect(screen.getByRole("button", { name: "More actions for p002@example.org" })).toBeInTheDocument();
  });

  it("names the roles in sentence case in the legend and the role picker", async () => {
    stubFetch({ [USERS]: listed([member(1)]) });
    renderTab();
    await screen.findByText("p001@example.org");
    const legend = screen.getByLabelText("Role definitions");
    expect(within(legend).getAllByRole("term").map((t) => t.textContent)).toEqual(["User", "Admin", "Platform admin", "Developer"]);
    expect(within(screen.getByLabelText("Role for p001@example.org")).getByRole("option", { name: "Platform admin" })).toBeInTheDocument();
  });

  it("shows Save only on a row you've changed, and no menu on your own row", async () => {
    stubFetch({ [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }) });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");

    expect(screen.queryByRole("button", { name: /^Save changes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for person0@example.org" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for person1@example.org" })).toBeInTheDocument();

    await ui.selectOptions(screen.getByLabelText("Role for person1@example.org"), "admin");
    expect(screen.getByRole("button", { name: /^Save ?changes for person1@example\.org$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save ?changes for person0@example\.org$/ })).not.toBeInTheDocument();
  });

  it("moves focus to the role select once a save removes the Save button", async () => {
    stubFetch({
      [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }),
      "PATCH /user-management/users/u1/roles": json({ username: "u1", roles: ["Admin"] }),
    });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");

    await ui.selectOptions(screen.getByLabelText("Role for person1@example.org"), "admin");
    await ui.click(screen.getByRole("button", { name: /^Save ?changes for person1@example\.org$/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Role for person1@example.org")).toHaveFocus();
  });

  it("closes a row menu on Tab and returns focus to its button", async () => {
    stubFetch({ [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }) });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");
    const trigger = screen.getByRole("button", { name: "More actions for person1@example.org" });

    await ui.click(trigger);
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus());
    expect(within(menu).getAllByRole("menuitem").every((item) => item.tabIndex === -1)).toBe(true);

    await ui.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
    expect(await screen.findByRole("dialog", { name: "Delete user" })).toBeInTheDocument();
  });

  it("names a bad email in text tied to the field, and says so when Add user is pressed empty", async () => {
    const net = stubFetch({ [USERS]: json({ users: [user(1)], nextPaginationToken: null, pageSize: 25 }) });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");
    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    const email = within(dialog).getByLabelText("Email address");

    expect(email).not.toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("button", { name: "Invite user" })).not.toHaveAttribute("aria-disabled");
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter an email address in the format user@example.com.");
    expect(email).toHaveFocus();

    await ui.type(email, "person@example");
    expect(email).toHaveAccessibleDescription(/format user@example\.com/);
    expect(within(dialog).getByRole("button", { name: "Invite user" })).not.toHaveAttribute("aria-disabled");
    await ui.type(email, ".org");
    expect(email).toHaveValue("person@example.org");
    expect(email).not.toHaveAttribute("aria-invalid", "true");
    expect(email).not.toHaveAccessibleDescription();
    expect(net.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("puts the first-load message in a status region that was empty when it mounted", async () => {
    let release!: () => void;
    stubFetch({
      [USERS]: () => new Promise<Response>((resolve) => {
        release = () => resolve(json({ users: [user(1)], nextPaginationToken: null, pageSize: 25 }));
      }),
    });
    renderTab();
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    await waitFor(() => expect(region).toHaveTextContent("Loading users..."));
    release();
    expect(await screen.findByText("person1@example.org")).toBeInTheDocument();
  });

  it("announces Saving and Inviting through status regions already in the page", async () => {
    const replies: Array<() => void> = [];
    const later = (body: unknown) => () =>
      new Promise<Response>((resolve) => replies.push(() => resolve(json(body))));
    stubFetch({
      [USERS]: json({ users: [user(0), user(1)], nextPaginationToken: null, pageSize: 25 }),
      "PATCH /user-management/users/u1/roles": later({ username: "u1", roles: ["Admin"] }),
      "POST /user-management/users": later({}),
    });
    const { user: ui } = renderTab();
    await screen.findByText("person1@example.org");
    const statuses = () => screen.getAllByRole("status").map((r) => r.textContent);

    await ui.selectOptions(screen.getByLabelText("Role for person1@example.org"), "admin");
    await ui.click(screen.getByRole("button", { name: /^Save ?changes for person1@example\.org$/ }));
    await waitFor(() => expect(statuses()).toContain("Saving changes for person1@example.org"));
    replies.shift()!();
    await waitFor(() => expect(statuses()).not.toContain("Saving changes for person1@example.org"));

    await ui.click(screen.getByRole("button", { name: "Invite user" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await ui.type(within(dialog).getByLabelText("Email address"), "new@example.org");
    const status = within(dialog).getByRole("status");
    expect(status).toBeEmptyDOMElement();
    await ui.click(within(dialog).getByRole("button", { name: "Invite user" }));
    expect(within(dialog).getByRole("button", { name: "Inviting..." })).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(status).toHaveTextContent("Inviting user"));
    replies.shift()!();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("puts the users table in a named scroll region the keyboard can reach", async () => {
    stubFetch({ [USERS]: json({ users: [user(1)], nextPaginationToken: null, pageSize: 25 }) });
    renderTab();
    await screen.findByText("person1@example.org");
    const region = screen.getByRole("region", { name: /^Users table/ });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toContainElement(screen.getByRole("table", { name: "Users" }));
  });
});
