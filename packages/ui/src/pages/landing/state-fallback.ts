import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Branding } from "../../common/branding";
import type { ResolvedHome } from "../../common/home-copy";
import { GovBannerView } from "../../components/common/GovBannerView";
import { SignInPending, StateHomeView } from "./StateHomeView";

/**
 * The state home page as the app first renders it (skip link, gov banner, page with the sign-in card's
 * place held), pre-rendered by the build into index.html so the swap to React changes nothing on screen.
 */
export function stateFallback(branding: Branding, home: ResolvedHome): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement("a", { href: "#main-content", className: "marketing__skip-nav" }, "Skip to main content"),
      branding.govHeader ? createElement(GovBannerView, { govHeader: branding.govHeader }) : null,
      createElement(
        "main",
        { id: "main-content", tabIndex: -1 },
        createElement(StateHomeView, { branding, home, signIn: createElement(SignInPending, { appName: branding.appName }) })
      )
    )
  );
}
