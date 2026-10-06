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
export const MFA_DEADLINE: number | null = MFA_DEADLINE_ISO ? Date.parse(MFA_DEADLINE_ISO) : null;
