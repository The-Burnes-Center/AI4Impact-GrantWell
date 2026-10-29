import { STATE_SITES, type StateSite } from "./instance";

/**
 * The hand-off from a multi-state site to a state's own site. It rides in the URL fragment, which
 * browsers never send to the server, so the email stays out of access logs and analytics.
 */
const SIGN_UP_KEY = "sign-up";

export const stateSiteFor = (code: string): StateSite | undefined =>
  code ? STATE_SITES.find((site) => site.state === code) : undefined;

export function signUpHandoffUrl(site: StateSite, email: string): string {
  const params = new URLSearchParams({ [SIGN_UP_KEY]: "" });
  if (email.trim()) params.set("email", email.trim());
  return `${site.url}/#${params.toString()}`;
}

/** The arriving hand-off, if the page was opened from one; `email` may be empty. */
export function readSignUpHandoff(hash: string): { email: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has(SIGN_UP_KEY) ? { email: params.get("email") ?? "" } : null;
}
