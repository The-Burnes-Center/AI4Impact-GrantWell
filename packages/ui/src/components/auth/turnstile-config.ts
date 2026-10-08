import { TURNSTILE_ENABLED } from "../../common/instance";

// Injected by vite `define`. Empty means Turnstile is not configured for this build, and every
// call site degrades to its pre-Turnstile behaviour; a deployment with turnstile off is always empty.
export const TURNSTILE_SITE_KEY = TURNSTILE_ENABLED ? __TURNSTILE_SITE_KEY__ : "";
