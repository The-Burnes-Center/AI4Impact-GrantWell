import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBranding } from "../../common/branding";
import { instance } from "../../test/instance";
import { renderApp } from "../../test/render";
import { AppTabsHeader } from "./AppTabsHeader";
import { NavigationProvider } from "./NavigationProvider";
import { AppSidebar } from "./UnifiedNavigation";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  instance.activeBranding = { ...defaultBranding, navigation: { layout: "tabs" } };
});

const shellAt = (route: string) =>
  renderApp(
    <NavigationProvider>
      <AppTabsHeader />
      <AppSidebar />
    </NavigationProvider>,
    { route }
  );

const tabs = () => within(screen.getByRole("navigation", { name: "Main" }));

describe("header tabs layout", () => {
  it("puts the main pages in header tabs and shows no side menu on a list page", () => {
    shellAt("/chat/sessions");
    expect(tabs().getByRole("link", { name: "My Chats" })).toHaveAttribute("aria-current", "page");
    expect(tabs().getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "This grant" })).toBeNull();
  });

  it("on a grant's requirements, marks Home as the section and shows only the grant's side menu", () => {
    shellAt("/requirements/Water%20Grant?grant=Water%20Grant");
    expect(tabs().getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "true");
    const side = within(screen.getByRole("navigation", { name: "This grant" }));
    expect(side.getByRole("button", { name: "Requirements" })).toHaveAttribute("aria-current", "page");
    expect(side.getByRole("button", { name: "Chat with AI" })).toBeInTheDocument();
    expect(side.queryByRole("button", { name: "My Chats" })).toBeNull();
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
  });

  it("marks My Applications as the section while an application is open", () => {
    shellAt("/document-editor?grant=Water%20Grant");
    expect(tabs().getByRole("link", { name: "My Applications" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("navigation", { name: "This grant" })).toBeInTheDocument();
  });

  it("keeps the side menu on every page when the deployment uses the sidebar layout", () => {
    instance.activeBranding = defaultBranding;
    renderApp(
      <NavigationProvider>
        <AppSidebar />
      </NavigationProvider>,
      { route: "/documents" }
    );
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "My Documents" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
