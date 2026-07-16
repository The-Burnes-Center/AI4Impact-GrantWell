# GrantWell Implementation Plan — Reorg-in-Place → Freeze Snapshots + v1.5

**Approach (decided 2026-07-16).** A read-only coupling scan of `generic-main` showed the
state/identity coupling is concentrated and largely already parameterized. So we **reorganize this
repo into the neutral engine in place**, then **freeze per-state snapshots out of it** — instead of
rebuilding a new `grantwell-core` repo from scratch and porting ~100 files. The GovTech delivery
model (each state owns an auditable, self-repairable snapshot) is preserved; only the path to the
engine changes.

This is the single source of truth. It supersedes and replaces the from-scratch
`grantwell-core-replatform.md` and the standalone `v1.5-milestone-plan.md` (both deleted).

---

## 0. Why this approach (evidence from the coupling scan)

- **No Massachusetts design system.** `@massds` / `mayflower` = **zero hits** in the tree. The main
  argument for a from-scratch rebuild does not exist.
- **State is already env-driven.** [lib/shared/states.ts](../lib/shared/states.ts) is the single
  source of truth, injected backend-wide as the `SUPPORTED_STATES` env var and copied to the
  frontend at build time (`copy-shared` npm script). The chat prompt is already state-agnostic
  (`${stateLabel}`).
- **A config foundation already exists.** The `ENVIRONMENT` switch in
  [lib/constants.ts](../lib/constants.ts) branches cognito domain / stack name / KB index; the
  frontend fetches `aws-exports.json` at *runtime* (`AppConfigured.tsx`), so identity isn't baked
  into the build.
- **Remaining coupling is bounded and mechanical** — enumerated in §3.

**Reorg advantage for the swap:** reorganizing in place keeps the **same CDK logical IDs**, so a
later deploy onto the existing live stack is recognized as "same resources, new code" — a from-scratch
repo would generate new IDs and trigger delete-and-recreate of stateful resources.

**Effort:** ~3–5 days to neutralize + freeze tooling (vs ~2 weeks for a rebuild).

---

## 1. Target repo shapes

### Engine — this repo, neutralized (`grantwell-core`, tag-versioned)
Layout is essentially unchanged; the diff is *inside files* plus one new config contract and the
removal of hardcoded identity + the committed `aws-exports.json`.

```
grantwell-core/
  bin/gen-ai-mvp.ts               (already env-agnostic)
  lib/
    constants.ts                  CloudFront URLs parameterized
    shared/states.ts              unchanged — state source of truth
    shared/config.ts     ★ NEW    InstanceConfig / BrandingConfig contract (the core↔config seam)
    authorization/index.ts        Cognito RETAIN
    chatbot-api/buckets/buckets.ts  S3 RETAIN
    chatbot-api/functions/**      state-name maps collapsed; region literals swept
    user-interface/app/
      src/common/constants.ts     CHATBOT_NAME + branding read from config
      src/components/ui/styles.ts colors read from BrandingConfig
      src/pages/landing/chrome.tsx logo/footer/partner links from config
      aws-exports.json   ✗ REMOVED (git rm --cached)
```

### Deliverable — the frozen repo a state owns (`grantwell-<state>`)
```
grantwell-ma/
  core/       frozen copy of grantwell-core @ vX.Y.Z (editable, auditable)
  config/     instance.config.ts + branding/ (logo, colors, name, GA id) + assets/
  docs/       handoff (configure / deploy / take a core update)
  VERSION     "core vX.Y.Z"
```
The shared multi-state deployment we host is the same engine with `routing: "picker"`.
**The entire core↔instance boundary is the `config/` directory ↔ `lib/shared/config.ts`.**

---

## 2. Phase 0 — Protect live data (PREREQUISITE, both AWS accounts)

Audited 2026-07-16. Both live stacks: DynamoDB = **Retain** (safe); **Cognito + S3 = Delete (at
risk)**.

| Instance | Stack | Account |
|---|---|---|
| Generic | `grantwell-staging` | `530075910224` |
| MA prod | `gw-stack-prod` | `976046823671` (EOTSS) |

**Change (code edits already made):**
- [lib/authorization/index.ts](../lib/authorization/index.ts): UserPool `removalPolicy` → `RETAIN`.
- [lib/chatbot-api/buckets/buckets.ts](../lib/chatbot-api/buckets/buckets.ts): both data buckets
  `removalPolicy` → `RETAIN`, `autoDeleteObjects` → `false`.

**Apply via a real `cdk deploy`** (computes the correct minimal change set). **Blocked locally:**
synth needs Docker (Python Lambda layer bundling), unavailable in current WSL. Options: enable
Docker Desktop + WSL integration, or run through CI.

**Do NOT** hand-patch the live CloudFormation template — a trial `update-stack` fanned out to 49
dependency-graph resources; rejected. `cdk deploy` is the only sanctioned path.

**Verification:** after deploy, `aws cloudformation get-template` shows `DeletionPolicy: Retain` on
the UserPool + 2 data buckets, no resource replacement in the change set.

---

## 3. Phase 1 — Neutralize the engine (branch `grantwell-core-neutralize`, ~3–5 days)

Do tasks in order; **build + run the app and click through (landing, chat, NOFO upload, user
management) after each** before moving on. All risk here is ordinary-refactor risk (missed string,
bad import, wrong label) — nothing touches data or infra.

### Task 1 — Collapse duplicate state-name maps onto the env var  *(functional risk: coordinate all consumers)*
Six lambdas hardcode a `STATE_NAMES` / legacy map instead of reading `SUPPORTED_STATES`. Make the
`SUPPORTED_STATES` payload carry `{code, name}` and have all consumers read it.
- [generate-section/index.mjs:36](../lib/chatbot-api/functions/draft-pipeline/generate-section/index.mjs#L36)
- [websocket-chat/index.mjs:100](../lib/chatbot-api/functions/websocket-chat/index.mjs#L100)
- [draft-generation/index.mjs:19](../lib/chatbot-api/gateway/api-routes/draft-generation/index.mjs#L19)
- [retrieveNOFOQuestions/index.mjs:13](../lib/chatbot-api/functions/landing-page/retrieveNOFOQuestions/index.mjs#L13)
- [retrieveNOFOSummary/index.mjs:7](../lib/chatbot-api/functions/landing-page/retrieveNOFOSummary/index.mjs#L7)
- [users/index.mjs:26](../lib/chatbot-api/functions/user-management/users/index.mjs#L26) (legacy map)
**Verify:** state labels still render full names ("Massachusetts", not "MA") in chat + summaries.

### Task 2 — Branding config seam  *(largest surface, ~19 files; shallow/visual risk)*
Introduce a `branding` object and route identity through it.
- Extend [common/constants.ts:30](../lib/user-interface/app/src/common/constants.ts#L30) (`CHATBOT_NAME`) into a full branding block.
- Route the ~19 "GrantWell" literals (page titles in `App.tsx`, `chrome.tsx`, `AuthPanel.tsx`,
  `LandingPage.tsx`, `HomePage.tsx`, etc.) through it.
- Colors already centralized in [components/ui/styles.ts](../lib/user-interface/app/src/components/ui/styles.ts) — point them at `BrandingConfig`.
- Chrome assets (wordmark/favicon/partner logos/links) in
  [pages/landing/chrome.tsx](../lib/user-interface/app/src/pages/landing/chrome.tsx) → config; keep
  generic defaults in `public/images/`, per-state assets in `config/`.
**Verify:** app builds; header/footer/titles render from config; swap a demo branding → everything changes.

### Task 3 — GA IDs to config  *(trivial)*
Two hardcoded IDs: `App.tsx` (`G-K27MB9Y26C`) and `index.html` (`G-1CVKPYK2GD`). Move into config.

### Task 4 — Region sweep  *(safe if mechanical — fallback preserves behavior)*
~24 pure-hardcoded `us-east-1` / `region_name='us-east-1'` across lambdas → `process.env.AWS_REGION || 'us-east-1'`.
Also cognito domain suffix in [lib/user-interface/index.ts:68](../lib/user-interface/index.ts#L68).
Parameterize the 2 CloudFront URLs in [constants.ts:102](../lib/constants.ts#L102),[:106](../lib/constants.ts#L106).
**Verify:** unset env var → identical behavior (fallback).

### Task 5 — Un-track `aws-exports.json`  *(one gotcha)*
`git rm --cached lib/user-interface/app/aws-exports.json` (tracked despite gitignore; leaks staging
identity). **Must** document/ensure it's generated at deploy time — the frontend fetches it at
runtime, so a clean checkout without it breaks Amplify config.

### Task 6 — Config contract  *(additive, safe)*
New `lib/shared/config.ts`: `InstanceConfig` (`instance`, `routing`, `branding`, `shared`, `states`)
+ `BrandingConfig`. This is the whole surface between `core/` and `config/`.

**End of Phase 1:** repo builds; renders MA via config and a demo state via config with no leakage;
grep confirms zero hardcoded identity.

---

## 4. Phase 2 — Freeze tooling + MA deliverable (~2–3 days)

1. Freeze-snapshot script: copy neutralized repo → `grantwell-<state>/core/` + `config/` + VERSION;
   tag engine `v0.1.0`.
2. Build `grantwell-ma`: freeze core into `core/`, fill `config/` (MA branding, Cognito, account).
3. Deploy MA deliverable to a **NEW separate stack** (`grantwell-ma-staging`, distinct KB index) —
   never onto `gw-stack-prod` / `grantwell-staging`. Verify parity vs current staging-MA (landing,
   auth, chat, editor, KB sync).
4. Genericness proof: deploy throwaway demo-state config; confirm branding fully swaps. Write MA
   handoff docs.

**After this:** new state = config bundle → freeze → hand over.

---

## 5. Phase 3 — v1.5, native in the neutral engine

**Feature 1 — Admin NOFO visibility (~4.5d, pull forward; mostly frontend, no new model, no external dep):**
unified lifecycle view (uploaded → processing → failed/quarantined → available → archived) over
existing endpoints; live status refresh; surface quarantine/validate reason + existing retry;
explicit active/archived toggle.

**Feature 2 — Notifications (~9.5d, after engine neutral):**
- Preferences store: `user-notification-prefs` table (mirror `FeatureRolloutTable`) +
  `/profile`+`/notifications` endpoints + preferences frontend page.
- Real-time match on `status→active` (DynamoDB Stream) + digest (EventBridge cron, **state-scoped**).
- SES delivery: **prod access already GRANTED** (case `172427612300739`, acct `530075910224`);
  `no-reply@grantwell.us` verified. Remaining: DKIM-verify `grantwell.us` domain + IAM
  `ses:SendEmail` + send Lambda + 2 templates.

---

## 6. The consequence-free swap (replace current backend, lose nothing, keep the same stack)

- Stateful audit done (§2). DynamoDB safe; Cognito + S3 fixed in Phase 0.
- Reorg-in-place keeps the **same logical IDs** → an update to the existing stack is recognized as
  the same resources (a from-scratch repo would delete-and-recreate).
- Validate on the throwaway `grantwell-ma-staging` stack first (zero blast radius), then deploy onto
  the live stack once green and Phase 0 (Retain) is applied.

### Hard don'ts
- **Do not push to `generic-main`** — [.github/workflows/deploy-grantwell.yml](../.github/workflows/deploy-grantwell.yml)
  auto-runs `cdk deploy grantwell-staging` on every push. Neutralization stays on
  `grantwell-core-neutralize`.
- **Do not `cdk deploy` with `ENVIRONMENT`/stack = `grantwell-staging` or `production`** until
  Phase 0 (Retain) is applied and the throwaway-stack validation is green.

---

## 7. Current status (2026-07-16)

- Branch `grantwell-core-neutralize` created off `generic-main`.
- Phase 0 code edits made (Cognito + S3 Retain) — **not deployed** (blocked on Docker).
- No AWS changes made. (One inert patched-template file left in the CDK assets bucket — deletable.)
- Phase 1 / 2 / 3: not started.

### Immediate open item
Phase 0 is the only urgent + blocked item: live Cognito users + S3 files remain unprotected until
the Retain `cdk deploy` runs (needs Docker or CI) on **both** accounts. Everything else is buildable
at will.
