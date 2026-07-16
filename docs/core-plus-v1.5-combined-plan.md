# GrantWell Combined Plan — Reorg-in-Place → Freeze Snapshots + v1.5

**Revised approach (2026-07-16).** A thorough coupling scan of `generic-main` overturned the
from-scratch `grantwell-core` rebuild assumption. The state/identity coupling is **concentrated and
largely already parameterized** — so we **reorganize *this* repo into the neutral engine in place**,
then **freeze per-state snapshots out of it**, instead of standing up a new empty repo and porting
~100 files. The GovTech delivery model (states own an auditable, self-repairable snapshot) is fully
preserved; only the path to the engine changes.

Supersedes the from-scratch [grantwell-core-replatform.md](grantwell-core-replatform.md) and the
parallel [v1.5-milestone-plan.md](v1.5-milestone-plan.md).

## Why reorg-in-place, not a rebuild (evidence)

A read-only scan of the whole tree found:

- **No Massachusetts design system.** `@massds` / `mayflower` = **zero hits**. The main argument
  for a clean rebuild does not exist.
- **State is already env-driven.** [lib/shared/states.ts](lib/shared/states.ts) is the single
  source of truth, injected backend-wide as `SUPPORTED_STATES` and copied to the frontend at build
  time. The chat prompt is already state-agnostic (`${stateLabel}`). A new state is nearly already
  "add a `{code,name}` + redeploy."
- **A config foundation already exists.** The `ENVIRONMENT` switch in
  [lib/constants.ts](lib/constants.ts) branches cognito domain / stack name / KB index; the
  frontend fetches `aws-exports.json` at *runtime*, so identity isn't baked into the build.
- **Remaining coupling is bounded and mechanical** (see task list): ~6 duplicate state-name maps,
  ~19 "GrantWell" string literals, colors already centralized in one file, chrome in ~3 components,
  ~24 hardcoded `us-east-1` literals, 2 CloudFront URLs, 2 GA IDs, and a committed
  `aws-exports.json` that should be untracked.

**Effort: ~3–5 days to neutralize + freeze tooling**, vs ~2 weeks for a from-scratch rebuild.

## Decisions locked

| Decision | Choice |
|---|---|
| Engine | **Reorganize `generic-main` in place** into the neutral engine (no new empty repo to port into). |
| Delivery model | **Owned per-state snapshots** — freeze the neutralized repo into `grantwell-<state>/core/` + `config/` + VERSION. States own/audit/self-repair. (Unchanged from core plan.) |
| Work location | **Dedicated branch `grantwell-core-neutralize`** off `generic-main` — so the `generic-main` auto-deploy trigger doesn't fire mid-reorg. |
| Source of truth | Code = `generic-main` (state-awareness foundation). Plans + MA chrome = `main`. |
| v1.5 sequencing | Feature 1 (admin NOFO visibility) pulled forward; Feature 2 (notifications) after the engine is neutral. |
| SES | Already GRANTED (case `172427612300739`, acct `530075910224`); `no-reply@grantwell.us` verified. Only DKIM-domain verification remains for deliverability. |

---

## Phase 0 — Protect live data (prerequisite, both stacks)

Before any deploy near live stacks. Audited 2026-07-16: DynamoDB = **Retain** (safe) on both
instances; **Cognito + S3 = Delete (at risk)** on both.

- Generic: `grantwell-staging` @ acct `530075910224`.
- MA prod: `gw-stack-prod` @ acct `976046823671` (EOTSS).

**Action:** flip Cognito + S3 to `RemovalPolicy.RETAIN` (and `autoDeleteObjects: false`). Code edits
made in [lib/authorization/index.ts](lib/authorization/index.ts) +
[lib/chatbot-api/buckets/buckets.ts](lib/chatbot-api/buckets/buckets.ts). **Apply via a real
`cdk deploy`** (needs Docker — unavailable in current WSL; run in CI or a Docker-enabled env).
A direct hand-patched-template `update-stack` was rejected: it fanned out to 49 dependency-graph
resources — not the surgical change intended. Do not hand-edit live templates.

---

## Phase 1 — Neutralize the engine (on `grantwell-core-neutralize`, ~3–5 days)

| # | Task | Files | Size |
|---|---|---|---|
| 1 | Collapse the ~6 duplicate hardcoded `STATE_NAMES` maps onto the `SUPPORTED_STATES` env var | generate-section, websocket-chat, draft-generation route, retrieveNOFOQuestions, retrieveNOFOSummary, users (legacy map) | S |
| 2 | Introduce a `branding` config object + route the ~19 "GrantWell" literals through it (extend `CHATBOT_NAME`); move chrome assets behind config | `common/constants.ts`, `pages/landing/chrome.tsx`, `App.tsx` titles, ~16 one-off strings; colors already in `components/ui/styles.ts` | M (~1–2d) |
| 3 | Move 2 GA IDs into config (`App.tsx`, `index.html`) | 2 files | S |
| 4 | Sweep ~24 hardcoded `us-east-1` → `process.env.AWS_REGION \|\| 'us-east-1'`; parameterize 2 CloudFront URLs in `constants.ts` | ~24 lambdas + constants.ts | M |
| 5 | `git rm --cached lib/user-interface/app/aws-exports.json` (tracked despite gitignore; leaks staging identity) | 1 | S |
| 6 | Define the `InstanceConfig` / `BrandingConfig` contract (the single seam between `core/` and `config/`) | new `lib/shared/config.ts` | S |

**End of Phase 1:** the repo builds, renders MA via config and a demo state via config with no
leakage, and has zero hardcoded instance identity. Grep-verify clean.

---

## Phase 2 — Freeze tooling + MA deliverable (~2–3 days)

Unchanged in spirit from the original core doc — the freeze step is identical regardless of how the
engine was produced.

| # | Task |
|---|---|
| 1 | Freeze-snapshot script: copy neutralized repo → `grantwell-<state>/core/` + `config/` + VERSION. Tag the engine `v0.1.0`. |
| 2 | Build `grantwell-ma`: freeze core into `core/`, fill `config/` with MA branding + Cognito + AWS account. |
| 3 | Deploy MA deliverable to a **NEW, separate** staging stack (`grantwell-ma-staging`, distinct KB index) — never onto `gw-stack-prod`/`grantwell-staging`. Verify parity vs current staging-MA. |
| 4 | Genericness proof: deploy a throwaway demo-state config; confirm branding fully swaps. Handoff docs. |

**New state after this = a config bundle → freeze → hand over.** States own/audit/self-repair `core/`.

---

## Phase 3 — v1.5, native in the neutral engine

**Feature 1 — Admin NOFO visibility (~4.5d, pull forward):** unified lifecycle view (uploaded →
processing → failed/quarantined → available → archived) over existing endpoints; live refresh;
surface quarantine/validate reason + existing retry; explicit active/archived toggle. Mostly
frontend, no new data model, no external dep.

**Feature 2 — Notifications (~9.5d, after engine neutral):** preferences store
(`user-notification-prefs` table + `/profile`/`/notifications` endpoints + preferences page),
real-time match on `status→active` (DynamoDB Stream) + digest (EventBridge cron, **state-scoped**),
SES delivery. SES prod access already granted; remaining SES work is DKIM-verify `grantwell.us` +
IAM `ses:SendEmail` + send Lambda + 2 templates.

---

## The consequence-free swap (goal: replace current backend, lose nothing, keep the same stack)

You want core to take over the existing live stacks with same users/data/URLs.

- **Stateful audit (2026-07-16):** DynamoDB = Retain (safe) both stacks; Cognito + S3 = Delete
  (fixed in Phase 0).
- **A fresh repo would generate different CDK logical IDs** → CloudFormation would delete-and-recreate
  the Delete-policy resources. Reorg-in-place **keeps the same logical IDs**, so an update to the
  existing stack is recognized as the same resources — this is a major advantage of reorg over
  rebuild for the swap.
- **Validate on a throwaway `grantwell-ma-staging` stack first** (zero blast radius), then deploy
  onto the live stack once green and Phase 0 (Retain) is done.

### Hard don'ts during this work
- **Do not push to `generic-main`** — [.github/workflows/deploy-grantwell.yml](.github/workflows/deploy-grantwell.yml)
  auto-runs `cdk deploy grantwell-staging` on every push. Work stays on `grantwell-core-neutralize`.
- **Do not `cdk deploy` with `ENVIRONMENT`/stack = `grantwell-staging` or `production`** until
  Phase 0 (Retain) is applied and the throwaway-stack validation is green.

---

## Net outcome

- **One repo becomes the engine**, in place — no ~100-file port, no rebuild.
- **Per-state owned snapshots preserved** — the GovTech delivery model is intact.
- **Reorg keeps logical IDs stable**, making the consequence-free in-place swap actually achievable.
- **v1.5 built once, in the neutral engine**; every future feature is fix-once-ship-everywhere.
