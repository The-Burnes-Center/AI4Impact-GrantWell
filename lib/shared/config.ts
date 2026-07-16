/**
 * InstanceConfig — the single contract between the neutral engine (core) and a per-instance
 * config bundle. A deployment is defined entirely by one InstanceConfig value: branding, which
 * states it serves, and the AWS/Cognito identity to wire into. The engine reads only from this
 * type; it hardcodes no state, brand, region, or account.
 *
 * Single-state deployment (e.g. MA) => routing "single", states = [one]. The shared multi-state
 * deployment we host => routing "picker", states = [many]. Branding is per-deployment, not
 * per-state: the picker switches which state's data is active, never the look.
 */

import { SUPPORTED_STATES } from "./states";

export type StateCode = typeof SUPPORTED_STATES[number]["code"];

/** How the app scopes state on login. */
export type Routing = "single" | "picker";

/**
 * Brand-defining values for a deployment. Only the brand-specific slots live here; engine-level
 * status/neutral colors (success, danger, greys) stay as core defaults and are not overridden
 * per instance. Any color set here overrides the matching core token.
 */
export interface BrandingConfig {
  /** Display name used in titles, headers, chat ("GrantWell" today). */
  appName: string;
  /** Org/owner shown in footer + about ("Burnes Center" etc.). */
  orgName: string;

  /** Brand palette overrides. Keys map to core color tokens; omit to keep the core default. */
  colors: {
    primary: string;
    primaryHover?: string;
    primaryActive?: string;
    primaryLight?: string;
    accent?: string;
    accentHover?: string;
  };

  /** Asset paths, resolved against the deployment's public assets. */
  logo: string;
  logoFooter?: string;
  favicon: string;

  /** Footer links (partner logos/links today are hardcoded in chrome; they move here). */
  footerLinks: { label: string; href: string }[];

  /** Optional Google Analytics measurement id; omit to disable analytics. */
  analyticsId?: string;

  /** Contact address surfaced in the UI, if any. */
  contactEmail?: string;
}

/** AWS identity a deployment wires into. */
export interface SharedAwsConfig {
  account: string;
  region: string;
}

/**
 * Per-state runtime binding. No branding here — the picker switches data/context, not the look.
 * Cognito is per state because each state's users live in that state's pool.
 */
export interface StateConfig {
  code: StateCode;
  cognito: {
    userPoolId: string;
    userPoolWebClientId: string;
    oauthDomain: string;
  };
}

/** The whole surface between core and a config bundle. Versioned with the core tag. */
export interface InstanceConfig {
  /** Stable id for the deployment: "ma" | "shared" | "colorado" ... */
  instance: string;
  routing: Routing;
  branding: BrandingConfig;
  aws: SharedAwsConfig;
  /** Single-state = array of one; picker = many. */
  states: StateConfig[];
}
