# GrantWell — Neutral Core Roadmap (reorg-in-place → freeze) + v1.5

## Goal
Stop maintaining two divergent branches (`main` = MA, `generic-main` = generic). Produce **one
engine** we maintain, from which each state is delivered a **frozen, self-contained repo they own**
(`core/` + `config/`). `main` is retired: MA becomes a config bundle on the engine. New state = a
config bundle, not a fork. The shared multi-state site is the same engine with `routing: "picker"`.

## Why reorg-in-place, not a rebuild
Scan of `generic-main` found: no `@massds`/Mayflower dependency; state already env-driven
([lib/shared/states.ts](../lib/shared/states.ts) → `SUPPORTED_STATES`); a config foundation already
exists (`ENVIRONMENT` switch + runtime `aws-exports.json`). Coupling is concentrated and mechanical.
Reorg keeps the same CDK logical IDs → a later backend swap onto the live stack is safe (a
from-scratch repo would delete-and-recreate stateful resources). ~3–5 days vs ~2 weeks.

---

## Target structure

### Engine — this repo, neutralized (`grantwell-core`, tag-versioned)
Same layout as today; the change is *inside files* + one config seam, minus hardcoded identity.
```
lib/shared/config.ts        ★ InstanceConfig / BrandingConfig — the ONLY core↔config surface (DONE)
lib/shared/states.ts          unchanged — state source of truth
lib/constants.ts              CloudFront URLs + names parameterized
lib/authorization/index.ts    Cognito RETAIN
lib/chatbot-api/**            state-name maps collapsed; region literals swept
lib/user-interface/app/
  src/common/branding.tsx     BrandingProvider + useBranding() + defaultBranding
  src/**                      "GrantWell"/colors/logos/GA read from branding, not literals
  aws-exports.json            REMOVED from git; generated at deploy
```

### Deliverable — the frozen repo a state owns (`grantwell-<state>`)
```
core/        frozen grantwell-core @ vX.Y.Z (auditable, editable)
config/      instance.config.ts + branding/ (logo, colors, name, GA) + assets/
docs/        handoff (configure / deploy / take a core update)
VERSION      "core vX.Y.Z"
```
Boundary invariant: anything instance-specific lives in `config/`; nothing instance-specific is
hardcoded in `core/`. That boundary IS `lib/shared/config.ts`.

---

## Environment facts (audited 2026-07-16)
| Instance | Stack | Account | Cognito+S3 | DynamoDB |
|---|---|---|---|---|
| Generic | `grantwell-staging` | 530075910224 | Delete → **must RETAIN** | Retain |
| MA prod | `gw-stack-prod` | 976046823671 | Delete → **must RETAIN** | Retain |

SES: prod access GRANTED (530075910224); `no-reply@grantwell.us` verified.
`generic-main` push auto-deploys `grantwell-staging` — neutralization stays on
`grantwell-core-neutralize`.

---

## Phases

### Phase A — Neutralize the engine  (branch `grantwell-core-neutralize`; one task at a time, build + click-through after each)
| Task | What | Risk |
|---|---|---|
| A1 ✅ | `lib/shared/config.ts` — `InstanceConfig`/`BrandingConfig` contract | done, committed `b9bf7e4` |
| A2 | Branding seam — `BrandingProvider` + `useBranding()` + `defaultBranding`; route the ~35 "GrantWell" name literals + colors ([styles.ts](../lib/user-interface/app/src/components/ui/styles.ts)) + chrome assets ([chrome.tsx](../lib/user-interface/app/src/pages/landing/chrome.tsx)) through it. Sub-split: **A2a name**, **A2b colors**, **A2c assets/footer links**. | visual, shallow |
| A3 | GA IDs → config (`App.tsx` `G-K27MB9Y26C`, `index.html` `G-1CVKPYK2GD`) | trivial |
| A4 | State-name maps — collapse 6 hardcoded `STATE_NAMES`/legacy maps onto `SUPPORTED_STATES` (carry `{code,name}`). Files: generate-section, websocket-chat, draft-generation route, retrieveNOFOQuestions, retrieveNOFOSummary, users | functional — verify labels |
| A5 | Region sweep — ~24 hardcoded `us-east-1` → `process.env.AWS_REGION \|\| 'us-east-1'`; parameterize 2 CloudFront URLs in [constants.ts](../lib/constants.ts) | safe (fallback preserves behavior) |
| A6 | `git rm --cached lib/user-interface/app/aws-exports.json`; ensure generated at deploy | one gotcha |

**Exit:** repo builds; renders MA via config and a demo state via config with no leakage; grep
confirms zero hardcoded identity.

### Quality riders (fold INTO Phase A — same files, near-zero marginal cost)
Audit verdict: this is not "AI slob" — types are disciplined (≈0 `any`), almost no dead code, few
comments. The real debt is *shared helpers exist but are ignored* and *config-as-literals*. Five
refactors ARE the neutralization work; do them in the same edits:
| Rider | Folds into | What |
|---|---|---|
| Q1 | **A4** | Centralize `STATE_NAMES` code→name into `states.ts`; delete 5 inline copies |
| Q2 | **A5** | Shared runtime-config module (region, bucket/table names); replaces ~30 `us-east-1` hardcodes + inconsistent DynamoDB client init |
| Q3 | A5-adjacent | One shared backend response/CORS helper (promote `knowledge-management/shared/response.mjs`); migrate ~26 inline CORS blocks + 16 raw `500`s; CORS origin `'*'` → config |
| Q4 | config | Status/role constant enums (`active`/`archived`/`draft`/`published`, `Admin`/`stateAdmin`, `custom:role`/`custom:state`); ~85 magic strings |
| Q5 | **A2b** | Move 206 hardcoded hex colors → `tokens.css` vars; adopt design system in top inline-style offenders (`UploadDocuments` 52, `UnifiedNavigation` 46) |

### Quality backlog (SEPARATE from neutralization — own commits, behavior-preserving, verify live before commit)
Do NOT mix into neutralization diffs. Each big decomposition is behavior-risk on a live product.
| # | Refactor | Effort / risk |
|---|---|---|
| QB1 | Frontend API-client base `request()` wrapper (auth + headers + `!ok` + 403) — collapses ~45 duplicated methods | low effort, low risk |
| QB2 | Shared `extractClaims`/`extractUserId` auth helper across 13 handlers (promote `knowledge-management/shared/auth.mjs`) | low / low |
| QB3 | Decompose `getUserResponse` in `websocket-chat/index.mjs` (~290-line fn, `:294-585`) into retrieval / prompt / stream units | med / **med — core chat path, verify** |
| QB4 | Split `DocumentManager.tsx` (1173 lines, 38 hooks) → `useDocumentManager` + subcomponents | med / **med — verify** |
| QB5 | Modularize `functions.ts` (1774 lines, 40 fns) — factor 38 repeated env/role/grant blocks; inject shared config once. Natural home for Q2/Q4 config plumbing | high / **high — infra, `cdk diff` must be clean** |

**Rule for the backlog:** one refactor per commit; behavior-preserving only; run the app / `cdk diff`
and confirm no behavioral change before committing. Never bundle with a neutralization or feature change.

### Phase B — Freeze tooling + MA deliverable
- B1 ✅ **COMPLETE** — config seam (both halves) + freeze tooling + tag:
  - **Frontend branding:** `config/instances/<id>.ts`, vite `@active-instance` alias per
    `GRANTWELL_INSTANCE` (default neutral); `genericBranding` moved out of core; residual identity
    (OmniHeader strip, AboutPanel copy) routed through branding.
  - **Backend/infra identity:** `lib/shared/instance-infra.ts` (`InstanceInfra` + `INSTANCE_INFRA`
    registry, keyed by `GRANTWELL_INSTANCE`); `constants.ts` getters + `bin` prefer it, else fall
    back to the existing `ENVIRONMENT` switch **unchanged** (verified byte-identical across all 4
    environments). Registry empty until B2 migrates MA/generic.
  - **Freeze:** `scripts/freeze.sh` snapshots engine@tag → `grantwell-<instance>/` (`core/` +
    `config/` + `VERSION` + `docs/HANDOFF.md`), warns on missing infra entry. Engine tagged
    **`v0.1.0`**; `VERSION` stamps `core v0.1.0`.
  - Verified: neutral bundle = 0 identity hits, generic = full identity; frozen core builds both
    ways green; root + app `tsc` clean.
- **MA model (decided):** this engine repo stays neutral + `generic` only — MA is NOT a committed
  instance here. MA ships as a **separate repo** `grantwell-ma` (the frozen deliverable), which
  carries its own **Mayflower chrome** as UI code (kept out of core). Enabling scaffolding is DONE:
  - swappable chrome via `@chrome` alias (default neutral core barrel; `GRANTWELL_CHROME` overrides);
  - `config/templates/ma/` — MA branding (GA `G-DY905CMNJN`), infra snippet (`gw-stack-prod`,
    `gw-auth-prod`, `knowledge-base-index-prod`, acct `976046823671`, all from `main`), chrome slot;
  - `scripts/freeze.sh --template ma` materializes it into the frozen core + wires `GRANTWELL_CHROME`.
- B2 ✅ **COMPLETE (turnkey)** — `scripts/freeze.sh --template ma` produces a working `grantwell-ma`:
  Mayflower chrome (`BrandBanner`/`MdsHeader`/`MdsFooter` from `main`) mapped onto the `@chrome`
  contract via `ma-chrome/index.tsx`; `apply.sh` adds massds deps, Mayflower CDN stylesheets, type
  decl, tsconfig path, and injects `INSTANCE_INFRA` entries. Proven: fresh freeze builds green with
  MA chrome + GA `G-DY905CMNJN`, 0 generic leakage, app+infra `tsc` clean, MA infra resolves
  (`gw-stack-prod`, acct `976046823671`). *Mayflower peer deps require `npm i --legacy-peer-deps`.*
- B3 ✅ **COMPLETE (code)** — `ma-staging` instance: ISOLATED names (`grantwell-ma-staging`, distinct
  Cognito/KB), no account binding → cannot touch live prod. Deliverable carries
  `.github/workflows/deploy-ma-staging.yml` (manual dispatch) + `docs/B3-PARITY.md` checklist. Both
  `ma` and `ma-staging` build green. **Deploy itself is NOT run** — needs AWS creds
  (`SERVICE_ROLE_ARN_MA_STAGING`) + a bootstrapped account; that's the human/CI step.
- B4 ✅ **COMPLETE** — `config/instances/demo.ts` (fictional GrantBridge / State of Example) builds
  with only its own identity; zero generic/MA/GA leakage; neutral + generic unaffected. Confirms a
  new state = one config file. Proof-by-build; no deploy needed.

### Phase C — Retire the two branches
- C1: reconcile any `main`-only fixes into the engine (most already converged).
- C2: MA runs as an engine config; `main` archived/retired. **Two-branch pain ends here.**

### Phase D — Protect live data + consequence-free swap
- D1: apply Cognito+S3 `RETAIN` via `cdk deploy` (code committed `ef8aa4b`; needs Docker/CI) on
  **both** accounts. Do NOT hand-patch live templates.
- D2: once engine validated on `grantwell-ma-staging` and D1 done, deploy the neutralized engine
  onto the live stacks — same logical IDs → same resources, no data loss.

### Phase E — v1.5 in the neutral engine
- E1: **Admin NOFO visibility (~4.5d)** — unified lifecycle view over existing endpoints; live
  refresh; quarantine reason + retry; active/archived toggle. Mostly frontend, no new model.
- E2: **Notifications (~9.5d)** — `user-notification-prefs` table + `/profile`/`/notifications` +
  preferences page; real-time match on `status→active` (DynamoDB Stream) + state-scoped digest
  (EventBridge cron); SES send (DKIM-verify `grantwell.us` + IAM + send Lambda + templates).

---

## Sequencing notes
- **A → B → C** is the critical path to killing the two-branch pain (the stated primary goal).
- **D (data protection)** is independent and urgent; do D1 as soon as a Docker/CI path exists —
  it does not block A/B.
- **E (v1.5)** rides on the neutral engine so features are built once. E1 can pull forward once the
  engine is stable; E2 waits on the finalized user model.

## Status (updated 2026-07-16)
Branch `grantwell-core-neutralize` (off current `generic-main`). All work committed, unpushed.

**Model correction (important):** `generic` = the **Burnes-owned multi-state product** (any US state
can use it; carries Burnes/InnovateUS/GovLab branding + partner footer). `main` = the **MA
instance**. `grantwell-core` = neutral engine both sit on as config bundles. In code this is now:
`defaultBranding` = neutral core; `genericBranding` = the Burnes instance preset; per-state configs
(MA etc.) come later.

**Done:**
- A1 (`b9bf7e4`) — `InstanceConfig`/`BrandingConfig` contract (`lib/shared/config.ts`).
- A2a (`09edf1d`) — `BrandingProvider` + `useBranding()`; app-name literals routed through branding.
- A2b (`34f1282`) — brand palette drives `--gw-color-*` CSS vars (Q5 rider; 261 inline hexes left for a separate find-replace).
- A2c (`b6fa086`) — neutral core default + `genericBranding` preset; logos + footer partner grid render from config.
- A3 (`9e4312e`) — single branding-driven GA id; analytics loads at runtime; none in neutral core.
- A4 (`e094a39`) — `SUPPORTED_STATES` now carries `[{code,name}]`; `getSupportedStateCodes()`/`stateNameFromCode()` in `grantwell-shared`; deleted 5 inline `STATE_NAMES` maps (Q1 rider). (Legacy `LEGACY_NAME_TO_CODE` in users left intentionally.)
- D1 code edits (`ef8aa4b`) — Cognito + S3 `RETAIN`. **Not deployed** (needs Docker/CI).
- Housekeeping — removed 36 gitignored `tsc` build artifacts (`.js`/`.d.ts`) from disk.

**Verification so far:** frontend `tsc` + full vite build green on every A2/A3 step; root `tsc` + Node
`--check` green on all 10 A4 handlers. No runtime/deploy verification yet (no Docker locally).

**Behavior-preserving:** provider defaults to `genericBranding`, so the running app is visually
unchanged; env-shape change in A4 kept all 10 parsers working.

- A5 (`f470841`) — region sweep: 33 pure-hardcoded `us-east-1` → `process.env.AWS_REGION || 'us-east-1'`
  across 18 files (16 `.mjs` + 2 `.py`); CloudFront `deploymentUrl` now honors `DEPLOYMENT_URL` env
  (per-env literals kept as last-resort fallback); exported shared `corsHeaders` + `jsonResponse`
  from `grantwell-shared` (Q3 — *available* for adoption, NOT a blind mass-rewrite of the 26 inline
  CORS blocks; those migrate incrementally per handler).
- A6 (`f470841`+1) — un-tracked committed `aws-exports.json` (leaked staging pool/endpoints;
  generated at deploy via `s3deploy.Source.jsonData` and at dev via the vite plugin, so removal is safe).

**PHASE A COMPLETE.** Verified: infra `tsc` clean; full vite build green; all `.mjs` Node `--check`
and both `.py` `py_compile` pass. Still NO runtime/deploy verification (no Docker locally) — the
backend changes (A4/A5) are merge-ready but unproven at runtime until deployed to a test stack.

**B1 COMPLETE** — commits `0c0bfe8` (frontend seam), `acdc6e9` (backend seam), `540a737` (freeze
both halves), tag `v0.1.0`. The core↔config boundary invariant is now true for BOTH frontend
(neutral bundle = zero instance identity) and backend (infra names come from `INSTANCE_INFRA` when
`GRANTWELL_INSTANCE` is set, else the unchanged `ENVIRONMENT` switch — verified byte-identical for
prod/staging/grantwell-staging/dev). `scripts/freeze.sh` proven end-to-end; engine tagged `v0.1.0`.

**PHASE B COMPLETE (all code + builds; deploys pending).** Commits: `a569ec0` swappable chrome,
`26638d7` templates+freeze, `0dc62fe` B2 turnkey MA chrome, `482b747` B3 ma-staging+CI+parity,
`8d6a29c` B4 demo swap. MA is a **separate repo** from `scripts/freeze.sh --template ma`; this engine
stays neutral + generic. Everything is proven by build/tsc/synth locally:
- B2: turnkey MA deliverable with Mayflower chrome; B3: isolated `ma-staging` target + CI workflow +
  parity checklist; B4: demo state proves full swap with zero cross-instance leakage.

**What remains (needs AWS/CI — not local):**
1. `scripts/freeze.sh --template ma ../grantwell-ma`, push it as its own repo (I don't touch remotes).
2. Run `deploy-ma-staging.yml` → walk `docs/B3-PARITY.md`. Needs `SERVICE_ROLE_ARN_MA_STAGING` +
   a bootstrapped account. *(This is the "prove on real AWS" step Phase A/B never had — no blocker
   now beyond creds; GitHub runners handle Docker bundling.)*
3. **Phase D** before any prod swap: deploy Cognito+S3 RETAIN (code at `ef8aa4b`), then deploy
   `GRANTWELL_INSTANCE=ma` onto live `gw-stack-prod` (same logical IDs → in-place update). Change
   window, not casual.
4. **Phase C**: once MA is proven on the seam, reconcile any `main`-only fixes, retire `main`.
