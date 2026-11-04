import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/render";
import { NavigationProvider } from "./NavigationProvider";
import { AppSidebar } from "./UnifiedNavigation";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

const sidebarAt = async (route: string, { drawer = false } = {}) => {
  const view = renderApp(
    <NavigationProvider>
      <AppSidebar />
    </NavigationProvider>,
    { route }
  );
  if (drawer) await view.user.click(await screen.findByRole("button", { name: "Open main menu" }));
  return { ...view, nav: within(screen.getByRole("navigation", { name: "Main" })) };
};

describe("app sidebar", () => {
  it("marks Home as the current page on /home", async () => {
    const { nav } = await sidebarAt("/home", { drawer: true });
    expect(nav.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("button", { name: "My Chats" })).not.toHaveAttribute("aria-current");
    for (const link of screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/home")) {
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });

  it("links My Documents and marks it current on its page", async () => {
    const { nav } = await sidebarAt("/documents");
    expect(nav.getByRole("button", { name: "My Documents" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
