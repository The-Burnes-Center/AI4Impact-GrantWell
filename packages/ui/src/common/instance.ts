import { Branding, defaultBranding } from "./branding";

export interface UsState {
  code: string;
  name: string;
}

// Written by core's UserInterface construct at synth; absent in standalone builds (neutral fallback).
const staged = Object.values(
  import.meta.glob<{ stage: "prod" | "dev"; branding: Branding; states: UsState[] }>("./generated/instance.json", {
    eager: true,
    import: "default",
  })
)[0];

export const activeBranding: Branding = staged?.branding ?? defaultBranding;
export const SUPPORTED_STATES: readonly UsState[] = staged?.states ?? [];
/** Analytics runs on prod deployments only. */
export const IS_PROD: boolean = staged?.stage === "prod";
