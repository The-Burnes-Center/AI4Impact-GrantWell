# config/ — the instance seam (frontend)

Everything instance-specific lives here; nothing instance-specific is hardcoded in `src/`
(the neutral core). This directory is what a delivered state repo owns and edits.

Each `instances/<id>.ts` exports a `Branding` value for one deployment. `active-instance.ts`
selects which one the current build uses, driven by the `GRANTWELL_INSTANCE` env var at build
time (default: `neutral`). The selected branding is baked into the bundle — rebuild to rebrand.

```
config/
  instances/
    neutral.ts    the core default (no partners, placeholder wordmark) — re-exports defaultBranding
    generic.ts    the Burnes-owned multi-state product (InnovateUS / Burnes / GovLab footer, GA id)
  active-instance.ts  picks the instance from GRANTWELL_INSTANCE (build-time)
```

Add a state: drop `instances/<state>.ts`, add it to the map in `active-instance.ts`, build with
`GRANTWELL_INSTANCE=<state>`.
