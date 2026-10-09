import { defaultBranding } from "../common/branding";
import type * as Instance from "../common/instance";

type Flags = {
  -readonly [K in keyof typeof Instance]: (typeof Instance)[K];
};

const defaults = (): Flags => ({
  activeBranding: defaultBranding,
  SUPPORTED_STATES: [
    { code: "MA", name: "Massachusetts" },
    { code: "NY", name: "New York" },
  ],
  IS_PROD: false,
  SEO_TITLE: defaultBranding.appName,
  MFA_DEADLINE_ISO: null,
  EMAIL_DIGEST: true,
  TURNSTILE_ENABLED: false,
  SINGLE_STATE: null,
  MFA_ENABLED: true,
  MFA_DEADLINE: null,
});

/**
 * Stands in for the staged instance.json, which a local build may have left behind. Tests change
 * fields here; components read them at render time through the mock in setup.ts.
 */
export const instance: Flags = defaults();

export function resetInstance(): void {
  Object.assign(instance, defaults());
}

export function withMfaDeadline(iso: string): void {
  instance.MFA_DEADLINE_ISO = iso;
  instance.MFA_DEADLINE = Date.parse(iso);
}

export function instanceModule(): typeof Instance {
  const module = {} as typeof Instance;
  for (const key of Object.keys(instance) as (keyof Flags)[]) {
    Object.defineProperty(module, key, { enumerable: true, get: () => instance[key] });
  }
  return module;
}
