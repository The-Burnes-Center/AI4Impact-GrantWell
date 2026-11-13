import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandingProvider, defaultBranding, type Branding } from "../../common/branding";
import { FullFooter } from "./FullFooter";

const branding: Branding = {
  ...defaultBranding,
  supportEmail: "hello@example.org",
  postalAddress: "1 Main St, Denver, CO",
  home: { tagline: "Find and apply for grants" },
  footer: {
    layout: "full",
    columns: [{ heading: "GrantWell", links: [{ label: "What's new", href: "/whats-new" }] }],
    partners: [{ label: "Burnes Center", href: "https://burnes.example.org" }],
    copyright: "Burnes Center, with the State",
    links: [{ label: "Privacy", href: "https://state.example.gov/privacy" }],
  },
};

const renderFooter = (narrow: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  return render(
    <BrandingProvider value={branding}>
      <FullFooter />
    </BrandingProvider>
  );
};

afterEach(() => vi.unstubAllGlobals());

describe("full footer", () => {
  it("lists the configured column, partners and contact, then the copyright and legal links", () => {
    renderFooter(false);
    expect(screen.getByRole("heading", { name: "GrantWell" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What's new" })).toHaveAttribute("href", "/whats-new");
    expect(screen.getByRole("link", { name: /Burnes Center/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "hello@example.org" })).toHaveAttribute("href", "mailto:hello@example.org");
    expect(screen.getByText("1 Main St, Denver, CO")).toBeInTheDocument();
    expect(screen.getByText(`© ${new Date().getFullYear()} Burnes Center, with the State`)).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Legal" })).getByRole("link", { name: /Privacy/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to top" })).toBeInTheDocument();
  });

  it("folds the columns into closed accordions on a phone", () => {
    const { container } = renderFooter(true);
    const columns = container.querySelectorAll("details");
    expect(columns).toHaveLength(3);
    columns.forEach((column) => expect(column).not.toHaveAttribute("open"));
    expect(screen.queryByRole("heading", { name: "GrantWell" })).toBeNull();
  });
});
