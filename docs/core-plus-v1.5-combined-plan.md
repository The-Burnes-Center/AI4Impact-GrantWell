# GrantWell Plan — Neutral Core (reorg-in-place) + v1.5

## Goal
One engine we maintain, delivered to each state as a **frozen, self-contained repo they own**
(`core/` + `config/`). New state = a config bundle, not a fork. We host the shared multi-state
deployment from the same engine.

## Approach
Reorganize **this repo** into the neutral engine in place, then freeze per-state snapshots — not a
from-scratch rebuild. Justification: the scan found no Mayflower/`@massds` dependency, state is
already env-driven ([lib/shared/states.ts](../lib/shared/states.ts) → `SUPPORTED_STATES`), and a
config foundation already exists (`ENVIRONMENT` switch + runtime `aws-exports.json`). Reorg keeps the
same CDK logical IDs, which is what makes a later in-place backend swap safe.

## Repo shapes
- **Engine (`grantwell-core`)** = this repo, tag-versioned, with all identity behind a config seam
  (`lib/shared/config.ts`) and no hardcoded state/branding/region.
- **Deliverable (`grantwell-<state>`)** = frozen `core/` @ a tag + `config/` (branding, Cognito, AWS
  account) + `VERSION`. The core↔instance boundary is exactly the `config/` dir.

---

## Live environment facts (audited 2026-07-16)
| Instance | Stack | Account | Cognito+S3 | DynamoDB |
|---|---|---|---|---|
| Generic | `grantwell-staging` | 530075910224 | **Delete (at risk)** | Retain (safe) |
| MA prod | `gw-stack-prod` | 976046823671 | **Delete (at risk)** | Retain (safe) |

- SES: production access GRANTED (acct 530075910224); `no-reply@grantwell.us` verified.
- `generic-main` auto-deploys `grantwell-staging` on push — **keep neutralization off this branch.**

---

## Next steps

### Step 0 — Protect live data  *(urgent; do before anything deploys)*
Retain code edits already committed (`ef8aa4b`): Cognito + both data buckets → `RemovalPolicy.RETAIN`,
`autoDeleteObjects: false`. Apply via `cdk deploy` (needs Docker daemon running).
- [ ] Confirm Docker daemon reachable from WSL (`docker info`).
- [ ] `cdk diff` then `cdk deploy` on Generic (530075910224) — verify only DeletionPolicy flips, no replacement.
- [ ] Same on MA prod (976046823671).
- Do **not** hand-patch live templates.

### Step 1 — Neutralize the engine  *(branch `grantwell-core-neutralize`; build + click-through after each task)*
1. Collapse 6 hardcoded `STATE_NAMES` maps onto `SUPPORTED_STATES` (carry `{code,name}`). Files:
   generate-section, websocket-chat, draft-generation route, retrieveNOFOQuestions,
   retrieveNOFOSummary, users (legacy map). Verify full state names still render.
2. Branding seam: extend `CHATBOT_NAME` into a `BrandingConfig`; route ~19 "GrantWell" literals,
   colors ([components/ui/styles.ts](../lib/user-interface/app/src/components/ui/styles.ts)), and
   chrome assets ([pages/landing/chrome.tsx](../lib/user-interface/app/src/pages/landing/chrome.tsx))
   through it.
3. Move 2 GA IDs (`App.tsx`, `index.html`) into config.
4. Region sweep: ~24 hardcoded `us-east-1` → `process.env.AWS_REGION || 'us-east-1'`; parameterize
   2 CloudFront URLs in [constants.ts](../lib/constants.ts).
5. `git rm --cached lib/user-interface/app/aws-exports.json`; ensure it's generated at deploy.
6. Add `lib/shared/config.ts`: `InstanceConfig` + `BrandingConfig` contract.

### Step 2 — Freeze tooling + MA deliverable
1. Snapshot script → `grantwell-<state>/core/` + `config/` + `VERSION`; tag engine `v0.1.0`.
2. Build `grantwell-ma` (freeze core + MA config).
3. Deploy to a **new** stack `grantwell-ma-staging` (distinct KB index) — never onto the live stacks.
   Verify parity vs current staging-MA.
4. Deploy a throwaway demo-state config to prove branding fully swaps.

### Step 3 — v1.5 in the neutral engine
- **Feature 1 — Admin NOFO visibility (~4.5d):** unified lifecycle view over existing endpoints,
  live refresh, quarantine reason + retry, active/archived toggle. Mostly frontend, no new model.
- **Feature 2 — Notifications (~9.5d):** `user-notification-prefs` table +
  `/profile`/`/notifications` + preferences page; real-time match on `status→active` (DynamoDB
  Stream) + state-scoped digest (EventBridge cron); SES send (DKIM-verify `grantwell.us` + send
  Lambda + templates).

### Step 4 — Consequence-free swap
Once the engine is validated on `grantwell-ma-staging` and Step 0 is deployed on both accounts,
deploy the neutralized engine onto the live stacks (same logical IDs → same resources, no data loss).

---

## Status
- On `generic-main`, ahead of origin by 1 (unpushed): this plan + Retain edits.
- Step 0 code done, **not deployed.** Steps 1–4 not started.
