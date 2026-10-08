import { Branding, defaultBranding } from "./branding";

export interface UsState {
  code: string;
  name: string;
}

/** Core resolves the defaults at synth (see seo-files.ts). */
export interface Seo {
  indexable: boolean;
  title: string;
  description: string;
  ogImage?: { path: string; alt: string };
}

interface StagedInstance {
  stage: "prod" | "dev";
  siteUrl: string;
  seo: Seo;
  branding: Branding;
  states: UsState[];
  mfaDeadline?: string;
  emailDigest?: false;
  turnstile?: false;
  tenancy?: "single";
  mfa?: "off";
}

// Written by core's UserInterface construct at synth; absent in standalone builds (neutral fallback).
const staged = Object.values(
  import.meta.glob<StagedInstance>("./generated/instance.json", {
    eager: true,
    import: "default",
  })
)[0];

export const activeBranding: Branding = staged?.branding ?? defaultBranding;
export const SUPPORTED_STATES: readonly UsState[] = staged?.states ?? [];
/** Analytics runs on prod deployments only. */
export const IS_PROD: boolean = staged?.stage === "prod";
export const SEO_TITLE: string = staged?.seo?.title ?? activeBranding.appName;
/** Epoch ms from which the app requires MFA; null when this deployment sets no deadline. */
export const MFA_DEADLINE_ISO: string | null = staged?.mfaDeadline ?? null;
/** False on deployments without SES: no digest emails, so no digest settings. */
export const EMAIL_DIGEST: boolean = staged?.emailDigest !== false;
/** False when the deployment runs without the Cloudflare Turnstile bot check. */
export const TURNSTILE_ENABLED: boolean = staged?.turnstile !== false;
/** A single-state deployment's state: every user belongs to it and no state is ever chosen. */
export const SINGLE_STATE: UsState | null = staged?.tenancy === "single" ? staged.states[0] ?? null : null;
/** False when the deployment turns MFA off: no setup prompt, no two-step settings, no resets. */
export const MFA_ENABLED: boolean = staged?.mfa !== "off";
export const MFA_DEADLINE: number | null = MFA_DEADLINE_ISO ? Date.parse(MFA_DEADLINE_ISO) : null;
