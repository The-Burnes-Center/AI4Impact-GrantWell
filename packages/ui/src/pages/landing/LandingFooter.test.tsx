import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BrandingProvider, defaultBranding } from "../../common/branding";
import { LandingFooter } from "./chrome";

describe("LandingFooter", () => {
  it("names the footer wordmark with the app name, like the header logo", () => {
    render(
      <BrandingProvider value={{ ...defaultBranding, appName: "GrantWell", logo: "/logo.svg", footer: { ...defaultBranding.footer, wordmark: "/wordmark.svg" } }}>
        <MemoryRouter>
          <LandingFooter />
        </MemoryRouter>
      </BrandingProvider>
    );
    expect(screen.getByRole("img", { name: "GrantWell" })).toHaveAttribute("src", "/wordmark.svg");
  });
});
