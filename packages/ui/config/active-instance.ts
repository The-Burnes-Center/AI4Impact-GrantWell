// Re-exports the branding for the instance selected at build time. The `@active-instance` import
// is aliased by vite (see vite.config.ts) to config/instances/<GRANTWELL_INSTANCE>.ts, so ONLY the
// selected instance's module enters the bundle — no other instance's identity is ever included.
export { branding as activeBranding } from "@active-instance";
