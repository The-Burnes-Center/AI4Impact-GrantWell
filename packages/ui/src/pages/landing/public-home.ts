import { CHROME } from "../../common/chrome";
import { HOME } from "../../common/instance";
import StateHome from "./StateHome";

/** The page for "/" and "/login" when the site has a public home with sign-in: a chrome PublicHome or the state layout. */
export const publicHome = () => CHROME.PublicHome ?? (HOME.layout === "state" ? StateHome : undefined);

export const hasPublicHome = () => publicHome() !== undefined;

/** The core state layout (not a chrome PublicHome), whose page the build pre-renders into index.html. */
export const isStateHome = () => !CHROME.PublicHome && HOME.layout === "state";
