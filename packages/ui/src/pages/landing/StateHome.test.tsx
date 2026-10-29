import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BrandingProvider, defaultBranding, type Branding } from "../../common/branding";
import { resolveHome } from "../../common/home-copy";
import { instance } from "../../test/instance";
import PublicHomePage from "./PublicHomePage";
import { hasPublicHome } from "./public-home";

const colorado: Branding = {
  ...defaultBranding,
  appName: "GrantWell",
  logo: "/images/co/grantwell-lockup.svg",
  supportEmail: "help@grantwell.us",
  govHeader: { logo: "/images/co/c.svg", label: "An official website of the State of Colorado", href: "https://colorado.gov" },
  footer: { partners: [], madeBy: { label: "AI for Impact", href: "https://burnes.northeastern.edu/ai-for-impact-coop/" } },
};

function renderHome(branding: Branding) {
  instance.activeBranding = branding;
  instance.SINGLE_STATE = { code: "CO", name: "Colorado" };
  instance.HOME = resolveHome(branding, "Colorado");
  render(
    <BrandingProvider value={branding}>
      <MemoryRouter>
        <PublicHomePage onAuthenticated={() => {}} />
      </MemoryRouter>
    </BrandingProvider>
  );
}

describe("state home page", () => {
  it("is the public home of a single-state site and not of grantwell.us", () => {
    expect(hasPublicHome()).toBe(false);
    instance.HOME = resolveHome(defaultBranding, "Colorado");
    expect(hasPublicHome()).toBe(true);
  });

  it("has one h1 (the logo, named for the app) with the sign-in card a level below", () => {
    renderHome(colorado);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(within(headings[0]).getByRole("img", { name: "GrantWell" })).toHaveAttribute("src", "/images/co/grantwell-lockup.svg");
    expect(screen.getByRole("heading", { level: 2, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Discover", "Understand", "Draft"]);
  });

  it("shows the seal beside the logo unless the branding turns it off", () => {
    renderHome(colorado);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.querySelector("img.state-home__seal")).toHaveAttribute("src", "/images/co/c.svg");
  });

  it("leaves the seal out when sealBesideLogo is false", () => {
    renderHome({ ...colorado, govHeader: { ...colorado.govHeader!, sealBesideLogo: false } });
    expect(screen.getByRole("heading", { level: 1 }).querySelector("img.state-home__seal")).toBeNull();
  });

  it("starts with a skip link and leaves focus at the top on load", async () => {
    renderHome(colorado);

    expect(document.activeElement).toBe(document.body);
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
  });

  it("links attribution, marking links that open a new tab", () => {
    renderHome(colorado);

    expect(screen.getByRole("link", { name: /^AI for Impact ?\(opens in new tab\)$/ })).toHaveAttribute("target", "_blank");
    const email = screen.getByRole("link", { name: "help@grantwell.us" });
    expect(email).toHaveAttribute("href", "mailto:help@grantwell.us");
    expect(email).not.toHaveAttribute("target");
  });

  it("moves focus to the card title when the user switches to create account", async () => {
    renderHome(colorado);

    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("heading", { level: 2, name: /create/i })).toHaveFocus();
  });
});
