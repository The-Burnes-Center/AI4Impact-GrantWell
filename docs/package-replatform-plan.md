# GrantWell package re-platform — plan

**Status:** approved, not started · **Date:** 2026-09-15

Turns GrantWell from a single CDK app into three published npm packages plus a per-state template
repo, so a state can adopt an engine update with `npm update` + redeploy instead of a folder swap.

This supersedes the frozen-snapshot delivery model (`core/` + `config/`, git tags, `freeze.sh`).
It keeps the **reorg-in-place** decision from `a54fc3b` — the neutral engine comes from
restructuring this repo, not a from-scratch rebuild.

---

## 1. Decisions

| # | Decision | Notes |
|---|---|---|
| D1 | **Three packages**, scoped under the `grantwell` npm org: `@grantwell/shared`, `@grantwell/core`, `@grantwell/ui` | Org claimed 2026-09-15. Scoping prevents anyone else publishing a plausible-looking `grantwell-*` package. Each package needs `publishConfig: { access: "public" }` — scoped packages publish private by default |
| D2 | **Public npm** | Auth-free installs for states. Engine source becomes world-readable |
| D3 | **No PyPI package** | Only 10 first-party `.py` files exist. Python handlers ship as assets inside `@grantwell/core` |
| D4 | **Delivery = GitHub template repo** per state | `freeze.sh` and `templates/ma/apply.sh` retire |
| D5 | **Floating `^` ranges** — redeploy pulls latest | Safety comes from D6 and D7, not from human review |
| D6 | **Any stateful-resource logical-ID change is a MAJOR bump** | `^` never crosses majors, so majors are opt-in per state |
| D7 | **Logical-ID snapshot tests land before any extraction** | The regression net for every phase after |
| D8 | **Packages-only** — no editable core, no fork path | Tier-3 changes need an upstream PR. `patch-package` is the documented emergency hatch |
| D9 | **Prompts and Bedrock model IDs are engine-fixed** | Not configurable by states |
| D10 | **Feature flags in config**, including `mfa` | One value per state; no per-environment override |
| D11 | **Branch-per-environment** | Both branches carry both overlays; the workflow selects by `github.ref` |
| D12 | **Secrets stay CI/env secrets** | Not Secrets Manager |
| D13 | **Two release lanes** — fast patch, `-rc.N` for core | Weight matched to blast radius |
| D14 | **`@grantwell/migrate` CLI** carries breaking-change migrations | Human-run at the major bump; CI runs `--check` only. Scaffolded at Phase 6, populated at the first major |
| D15 | **MA: staging first, prod deferred** | `ma-staging` proves parity; `gw-stack-prod` stays on its current deliverable |
| D16 | **Apache-2.0** | All candidates were open source; the explicit patent grant is what clears procurement review fastest. Add a `LICENSE` file — the current `"license": "ISC"` is an unreviewed CDK-init default |
| D17 | **`aws-cdk-lib`, `constructs`, `react` are peerDependencies, pinned exact** | States run exactly what we tested. Requires D17a and D17b below |
| D18 | **Release comms via GitHub Releases** | Changesets generates them. States must watch the repo — add it to the induction checklist |
| D19 | **Tiered public API**: a small stable surface (`GrantWellStack`, `GrantWellApp`, contracts) plus an `/experimental` entrypoint | Constructs and individual pages live under `/experimental` with no semver promise, so internal refactors stay cheap. Tier 2 composition uses it knowingly |
| D20 | **`routing` scoping centralized before extraction** | Phase 2. Enforcement moves into one helper rather than ~12 handlers |
| D21 | **State graduation deferred** | No shared→own data migration path until a real state asks. Tracked in §9 |

### Consequences worth stating plainly

- **No MFA-free staging** (D10). Testers enroll TOTP on staging too. If that proves untenable,
  promoting `mfa` into the environment overlay is a minor bump, not a breaking change.
- **A state cannot fix its own outage** (D8). Time-to-fix is bounded by our release latency, which
  makes PR responsiveness part of the product.
- **Prompt and model changes ship silently** (D9 + D5). They reach every state's production on the
  next deploy with nothing in `cdk diff` that reads as "the assistant behaves differently now."
  Mitigated by a dedicated changeset category that forces a minor bump and a visible release note.
- **Two delivery models coexist until MA prod moves** (D15).
- **A CDK CVE blocks every state until we cut a release** (D17). Pinned peers mean our release
  cadence now covers CDK patches, not just our own. **D17a:** a scheduled CI job watches for
  `aws-cdk-lib` releases and opens a bump PR automatically.
- **All packages must pin the identical version** (D17). npm 7+ errors on conflicting peer
  requirements, so if `@grantwell/core` and `@grantwell/ui` disagree on `aws-cdk-lib`, every state's
  install fails. **D17b:** a CI check (syncpack or manypkg) enforces lockstep across packages.
- Widening a pinned peer to a range later is **not** a breaking change, so D17 is reversible in a
  minor if pinning `react` in particular proves too rigid.

---

## 2. Target structure

### Engine monorepo (this repo, restructured)

```
grantwell/
├── packages/
│   ├── shared/                   → @grantwell/shared
│   │   └── src/
│   │       ├── instance-config.ts   InstanceConfig: branding + states + routing + features
│   │       │                        + stackName/cognitoDomain/kbIndex/deploymentUrl/aws
│   │       ├── branding.ts          type only, no React
│   │       ├── states.ts            helpers only — the state LIST moves to config
│   │       └── chrome-contract.ts   typed OmniHeader/LandingNavbar/AppNavbar/LandingFooter
│   ├── core/                     → @grantwell/core
│   │   └── src/
│   │       ├── grantwell-stack.ts   takes InstanceConfig as a prop; reads no env vars
│   │       ├── authorization/
│   │       ├── chatbot-api/         constructs, nested stacks, tables, buckets, kb, step fns
│   │       └── assets/              .mjs + .py handlers and layers, shipped via `files:`
│   ├── ui/                       → @grantwell/ui
│   │   └── src/
│   │       ├── GrantWellApp.tsx     router + providers, mounted by a template
│   │       ├── pages/ components/ hooks/ layouts/ common/ styles/
│   │       └── assets/images/       engine imagery only
│   └── migrate/                  → @grantwell/migrate  (scaffold at Phase 6)
└── .github/workflows/release.yml
```

### State template

```
grantwell-<state>/
├── package.json                  workspaces: ["config", "app", "infra"]
├── .github/workflows/deploy.yml
│
├── config/
│   ├── instance.ts               identity, colors, logo, footer, states, routing, features
│   └── environments/
│       ├── staging.ts            stackName, cognitoDomainName, kbIndexName, aws, domain, cert
│       └── production.ts         same shape, production values
│
├── app/
│   ├── index.html · vite.config.ts
│   ├── src/main.tsx              <GrantWellApp instance={instance} chrome={chrome} />
│   ├── src/chrome/index.tsx      this state's header/nav/footer (MA: Mayflower)
│   └── public/images/            this state's imagery
│
└── infra/
    ├── cdk.json
    └── bin/app.ts                new GrantWellStack(app, env.stackName, { config, env })
```

### How resolution differs

In the monorepo, `packages/*` are npm workspaces — `@grantwell/core` resolves through a symlink to
the local source folder. In a state repo it resolves to a published tarball. Same import path,
different resolution, and that gap is where packaging bugs hide: a Python handler dir, CSS file, or
image missing from a package's `files:` array works perfectly via symlink and 404s for every state.

**Mitigation — packaging smoke test in CI (from Phase 3 onward):** `npm pack` each package, install
the tarballs into a scratch template, then build and synth. This is the only check that exercises
what states actually receive.

From Phase 5 the monorepo **stops being deployable**. It keeps a synth fixture for the snapshot
tests, but Burnes' own deployments move to `grantwell-generic`, which installs from npm like any
state. A canary that resolves through symlinks isn't a canary.

### State template branches

Both branches carry **both** environment files, byte-identical. The workflow picks:

```yaml
- id: env
  run: echo "name=${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}" >> $GITHUB_OUTPUT
```

Config changes flow staging → main as clean fast-forwards. `mfa: false` can never reach production
by winning a merge conflict — it would have to be edited in `production.ts` deliberately.

---

## 3. Customization surface

### Tier 1 — `config/`, values only

Identity (`appName`, `orgName`) · 6 brand color tokens → CSS vars · logo, footer wordmark, favicon ·
footer partners + omni strip · `states` · `routing` · GA id · support email · feature flags ·
per-environment: `stackName`, `cognitoDomainName`, `knowledgeBaseIndexName`, `deploymentUrl`,
`aws.account/region`, custom domain + ACM cert · SES sender, postal address · digest and scraper
cron expressions.

```ts
features: {
  mfa: boolean,            // Cognito Mfa.REQUIRED vs OPTIONAL
  scraper: boolean,        // Grants.gov feed + auto-archive rules
  notifications: boolean,  // digest schedules; false drops the SES identity prerequisite
  analytics: boolean,      // /admin/analytics + dashboard
  aiGrantSearch: boolean,  // /ai-grant-search + Titan inference profile
}
```

**Flags gate schedules, Lambdas and routes — never stateful resources.** Tables and buckets are
always created. See §6 for why.

### Tier 2 — template code a state owns

`app/src/chrome/` (full header/nav/footer replacement against `ChromeContract`) · `app/public/images/` ·
CSS token overrides beyond the 6 colors · extra routes and pages (compose the router instead of
mounting `<GrantWellApp>` whole, importing pages from `@grantwell/ui/experimental` — see D19) ·
the deploy workflow.

### Tier 3 — fixed; upstream PR required

The 13 DynamoDB tables and GSIs · S3 layout · both Step Functions topologies · REST/WebSocket route
contract · Cognito pool structure and the `role`/`state` custom attributes · the authorizer ·
prompts and model IDs · all admin/analytics behavior.

---

## 4. Operational playbook

### Fixing a bug

1. Branch off `main`, fix, test.
2. `npm run test:synth` — logical-ID snapshots. Failure means you broke something or owe a major.
3. `npx changeset` — packages changed, and at what level (§5).
4. PR → review → merge. **Merging does not publish.**
5. Changesets opens a "Version Packages" PR. Merging *that* bumps, changelogs, tags, publishes.

**Lane selection (D13):**

| Lane | Scope | Flow |
|---|---|---|
| Fast | `@grantwell/ui` only, copy, styling | changeset → merge → publish |
| RC | `@grantwell/core`, prompts, models, config contract | publish `-rc.N` → Burnes staging pins the rc → verify → publish stable |

The rc mechanism matters because **dist-tags do not gate semver resolution** — `^2` resolves to the
highest published `2.x` regardless of whether it is tagged `latest`. Prerelease versions are
excluded from `^` ranges by default, so `-rc.N` is the only thing that actually holds states back.

### Inducting a new state

1. "Use this template" → `grantwell-<state>`.
2. Fill `config/instance.ts` — identity, colors, `states`, `routing: "single"`, feature flags.
3. Fill `config/environments/*.ts` — stack names, AWS account/region, domain, cert.
4. Drop imagery into `app/public/images/`.
5. Optional: `app/src/chrome/` if they have their own design system.
6. CI secrets: AWS OIDC role ARN, `GRANTS_GOV_API_KEY`, `TURNSTILE_*`.
7. **AWS prereqs — the day-one blockers:** CDK bootstrap in their account/region; Bedrock model
   access enabled in-region; SES verified identity + DKIM *only if* `notifications: true`; ACM cert
   in `us-east-1` if using a custom domain.
8. Push `staging` → deploys. Merge to `main` → production.
9. **Watch the engine repo for releases** (D18) — this is how they learn about prompt and model
   changes, which do not otherwise announce themselves.

### How updates land

Floating ranges do nothing on their own — `package-lock.json` pins exact versions and `npm ci`
installs the lockfile. The deploy workflow must update explicitly:

```yaml
- run: npm update @grantwell/shared @grantwell/core @grantwell/ui
- run: npx @grantwell/migrate --check    # fails if config needs migrating (see Majors)
- run: npm run build && npx cdk deploy --require-approval never
- run: |                     # audit trail: what is actually in prod right now
    git commit -am "deploy: core $(npm pkg get dependencies.@grantwell/core -w infra)" || true
    git push
```

Committing the lockfile back gives a per-deployment record of each state's engine version. Surface
the same version as a CFN output and in the UI footer.

### Majors

`^` never crosses majors, so a breaking change requires each state to bump deliberately. That is the
only moment a state must act — batch breaking changes into rare, well-documented majors, and ship
each one with a `@grantwell/migrate` migration (D14).

The split between human and CI matters here. Adopting a major is manual by construction: someone
edits `package.json` from `^2` to `^3`, runs `npx @grantwell/migrate` locally, and reviews the
resulting diff before pushing. CI never rewrites a state's config — it only runs
`@grantwell/migrate --check`, which fails the deploy if the installed engine needs a migration that
hasn't been applied. Enforcement in CI, authorship with a human.

Note that *detection* is already free: `InstanceConfig` is typed, so a breaking contract change
makes a state's `config/instance.ts` fail to typecheck. The CLI exists to automate the **fix**,
which is why it stays empty until there is both a real major and enough states for hand-editing to
hurt.

---

## 5. Versioning rules

| Bump | When |
|---|---|
| **major** | Any logical-ID change on a stateful resource; breaking `InstanceConfig` change; removing a config knob or API route |
| **minor** | New feature, new config knob with a default, new flag, **prompt change, model bump**, new route |
| **patch** | Fix with no template, logical-ID, or behavior-contract change |

Two CI enforcement points:

- Fail if the logical-ID snapshot changed but the changeset is not `major`.
- Prompt and model changes get their own changeset category so they cannot ship as a patch.

Packages start at `1.0.0`. The existing `grantwell-web@3.0.0` and `grantwell-infra@0.1.0` versions
do not carry over — they describe the app, not the engine contract.

---

## 6. Known issues to fix during migration

Found during the 2026-09-15 architecture review. Each is assigned to a phase in §7.

**Instance identity leaking into the engine**

- [`notifications-stack.ts:63-70`](../lib/chatbot-api/functions/notifications-stack.ts#L63-L70) reads
  `genericBrandingData` for digest color, logo, app name, org name, postal address and support
  email; sender is `no-reply@grantwell.us`. A delivered state emails Burnes-branded digests with a
  Boston address.
- [`marketing-landing.css:711-714`](../lib/user-interface/app/src/styles/marketing-landing.css#L711-L714)
  hardcodes `.marketing__partner--innovateus` and `--govlab` at sizes matched to Burnes' logos. The
  footer should size from config, not from a core stylesheet that knows partner names.
- [`generic.ts`](../lib/user-interface/app/config/instances/generic.ts) imports
  `../../../../shared/generic-branding` — the app reaching into the infra tree.

**Contracts that are not real**

- [`lib/shared/config.ts`](../lib/shared/config.ts) `InstanceConfig` has **zero importers**.
- `Branding` in [`branding.tsx`](../lib/user-interface/app/src/common/branding.tsx) claims to mirror
  `BrandingConfig` and has already drifted (`footer`/`omniPartners` vs `footerLinks`).
- `routing: "single" | "picker"` is type-only. Scoping actually comes from `SUPPORTED_STATES` plus
  the Cognito `state` attribute.
- `copy-shared` literally `cp`s [`states.ts`](../lib/shared/states.ts) into `src/common/generated/`.
- `SUPPORTED_STATES` is a hardcoded four-state list, so inducting a fifth state would require a
  `@grantwell/shared` release. Config must carry `states: [{ code, name }]` and the backend env var
  must derive from it.

**Packaging blockers**

- Root [`.npmignore`](../.npmignore) is the CDK-init default (`*.ts`, `!*.d.ts`) — it would strip all
  construct source while shipping the Python. Replace with an explicit `files:` array; verify with
  `npm pack --dry-run`.
- ~79 vendored third-party Python files in
  [`websocket-api-authorizer/`](../lib/authorization/websocket-api-authorizer/) (`ecdsa`, `requests`,
  `urllib3`, `rsa`, `jose`) would ride into every install, at every version. Convert to
  `requirements.txt` + Docker bundling like the shared layer already does.
- `public/images/` is **11 MB**, containing three different things: engine imagery (stays in
  `@grantwell/ui`), Burnes instance assets (move to the generic template), and **docs assets** —
  `architecture.png` plus five `* Page.png` README screenshots, ~2.3 MB, served from the web root
  and referenced by the root README. Move those to `docs/` and ship them in neither package.

**Runtime correctness**

- Tables set no `removalPolicy` (CDK default `RETAIN`) and no explicit `tableName`. Flipping a
  feature flag off then on creates **new** generated-name tables and silently orphans the old data,
  still billing. This is why flags must not gate stateful resources.
- Digest cron is hardcoded at [`cron(0 14 * * ? *)`](../lib/chatbot-api/functions/notifications-stack.ts#L235-L248);
  scraper at [09:00 and 02:00](../lib/chatbot-api/functions/scraper-stack.ts#L142-L144). Reasonable
  for Boston, wrong for California.
- Model IDs are fixed ([`functions.ts:123-125`](../lib/chatbot-api/functions/functions.ts#L123-L125))
  but region is config-driven. A region without `global.anthropic.claude-sonnet-4-6` or Titan v2
  synths clean and fails at runtime on first chat. Validate the pair in the stack constructor and
  throw, matching the existing `GRANTS_GOV_API_KEY` check.
- `TURNSTILE_SECRET_KEY` is passed as a Lambda env var
  ([`authorization/index.ts:74`](../lib/authorization/index.ts#L74)), so it sits in plaintext in the
  CloudFormation template and Lambda console. Acceptable for a Turnstile key; do not extend the
  pattern.

**Interaction with in-flight work**

- `LEGACY_STATELESS_ADMIN_IS_PLATFORM` is still `"true"` in
  [`chatbot-api/index.ts`](../lib/chatbot-api/index.ts) and `functions.ts`. The PlatformAdmin pool
  migration should finish before Phase 3, or the legacy flag gets frozen into a package API.

---

## 7. Phases

**How the work lands:** phase-by-phase PRs into `main`, keeping `bin/` and the deploy workflows
green throughout. The existing branch→stack mapping gives this a free safety net — a phase branch
deploys to `grantwell-burnes-staging` on push, so it is verified there before the merge to `main`
deploys it to `grantwell-staging` (grantwell.us). No long-lived reorg branch, no big-bang merge.

**Phase 0 — monorepo skeleton + `@grantwell/shared`**
Workspaces layout. Extract `InstanceConfig` as the real, declared type of instance files, merging in
`InstanceInfra`'s fields. Move `states` helpers to shared and the state *list* to config. Kill
`copy-shared` and the hand-mirrored `Branding`. Define `ChromeContract`.

**Phase 1 — logical-ID snapshot tests**
*This repo has no test infrastructure today* — no runner, no `*.test.ts`. Stand up vitest first
(`aws-cdk-lib/assertions` is runner-agnostic, and the UI package will want vitest anyway). Then
synth `grantwell-staging` and `grantwell-burnes-staging`, snapshot every stateful resource's logical
ID, wire the CI check that ties snapshot drift to a major bump. *Nothing else starts until this is
green.*

**Phase 2 — centralize state scoping**
State enforcement is currently spread across ~12 handlers each doing their own `SUPPORTED_STATES` /
`custom:state` checks, and KB retrieval filters by *document identifier* rather than by state — so
isolation depends on the NOFO-listing layer having filtered correctly upstream. Move those checks
into one shared authorizer/helper, then make `routing` select its behavior. Done here, in the
existing layout, so the current deploy pipeline validates it before anything moves into a package —
and so diffuse enforcement never becomes frozen package API.

**Phase 3 — extract `@grantwell/core`**
Constructs + assets behind a package boundary. `GrantWellStack` takes `InstanceConfig`, reads no env
vars. Digest branding off `genericBrandingData`. Feature flags including `mfa`, gating schedules and
routes only. De-vendor the Python authorizer. Model/region validation guard. Replace `.npmignore`
with `files:`; verify with `npm pack --dry-run`. Stand up the packaging smoke test (§2) as soon as
core is extracted — it is the check that catches missing assets before a state does.

**Phase 4 — extract `@grantwell/ui`** *(the bulk of the work)*
`@active-instance` and `@chrome` vite aliases become runtime injection via props and context. Typed
chrome contract. `public/` assets ship in-package after the three-way triage. Partner CSS out of
core. Export pages individually so a template can compose its own router.

**Phase 5 — template repo + dogfood** *(the monorepo stops deploying here)*
Build `grantwell-template`. Generate `grantwell-generic` and move Burnes' own staging and production
deployments onto it, so our deployments exercise the exact install path a state does. Retire this
repo's deploy workflows; keep only a synth fixture for the Phase 1 snapshot tests. Branch→stack
mapping is preserved, it just moves repos: `grantwell-generic` `main` → `grantwell-staging`,
`staging` → `grantwell-burnes-staging`. Branch-per-env
workflow with the explicit `npm update` step and lockfile write-back.

**Phase 6 — publish pipeline**
Changesets, two lanes, rc flow, npm publish on merge of the version PR. Set
`publishConfig: { access: "public" }` in every package.json — scoped packages publish private by
default, and the first publish is where that bites. Version as CFN output and in
the UI footer. Scaffold `@grantwell/migrate`.

**Phase 7 — MA staging**
Generate `grantwell-ma` from the template with Mayflower chrome as ordinary code in its own repo
(retiring `apply.sh`'s seven patch steps). Deploy `ma-staging`, prove parity against the current
deliverable using the existing B3-PARITY comparison. **`gw-stack-prod` is not touched** (D15).

---

## 8. Timeline

**Assumptions:** one engineer, full-time, already fluent in this codebase; no parallel feature work;
effort in working days. Scale driving the estimate: 5,065 lines of infra TS (23 files), 72
first-party Lambda handlers, 28,770 lines of frontend (165 files).

| Phase | Effort | Calendar | What drives it |
|---|---|---|---|
| 0 — skeleton + `@grantwell/shared` | 5d | 1 wk | Workspaces, `InstanceConfig`, and updating every `SUPPORTED_STATES` consumer |
| 1 — snapshot tests | 5d | 1 wk | Test infra from zero; nested stacks make logical-ID extraction fiddly |
| 2 — centralize scoping | 7–8d | 1.5 wks | ~12 handlers, and it is security-shaped so verification is real work |
| 3 — extract `@grantwell/core` | 11–14d | 2.5–3 wks | Env reads → config, feature flags, de-vendoring Python, packaging smoke test |
| 4 — extract `@grantwell/ui` | 15–20d | 3–4 wks | 29k lines; aliases → injection; 80 assets to triage; CSS in a library is genuinely painful |
| 5 — template + dogfood | 7–10d | 1.5–2 wks | Cutting over two live deployments, one of them grantwell.us |
| 6 — publish pipeline | 5d | 1 wk | Changesets, rc lane, npm org setup, version surfacing |
| 7 — MA staging | 8–11d | 2 wks | Porting Mayflower chrome to `ChromeContract`, then parity debugging |
| **Total** | **63–78d** | **13–16 wks** | ≈ 3–4 months solo |

### What moves the number

- **Parallelism.** Phases 0→1→2→3 are serial. But **Phase 4 (UI) only depends on Phase 0**, not on
  Phase 3 — so a second engineer can run UI extraction alongside core extraction, cutting ~3 weeks
  off the calendar. That is the only significant parallelization available.
- **Parallel feature work.** This assumes none. On a live product with users that is optimistic;
  realistically multiply calendar by 1.5–2×.
- **Holidays.** Starting mid-September, a 13–16 week run lands in late December / early January.
  Budget for the November–December slowdown.
- **External blocker.** The PlatformAdmin pool migration must finish before Phase 3 (§6), and it is
  not in this plan's control.

### Value lands before the end

Phases 0–2 are worth doing **even if packaging never ships**: they make `InstanceConfig` real, add
the first tests this repo has ever had, and consolidate state enforcement that is currently spread
across a dozen handlers. That is ~3.5 weeks to a strictly better codebase with no commitment to the
rest. Phase 6 is the first point where a state could actually consume a package, and Phase 7 is the
first proof the model works for a real deliverable.

---

## 9. Open items

- **Defensive unscoped names** — the `grantwell` org is claimed, but `grantwell-core` and friends
  are still free as unscoped names. Publishing placeholder stubs there is cheap insurance against a
  state engineer installing someone else's package by mistake. Optional.
- **MA prod cutover** — deliberately unscheduled. Revisit once `ma-staging` and one new state have
  both run on packages for a full release cycle.
- **`@grantwell/migrate` content** — scaffolded empty at Phase 6. The first real migration is written
  when the first breaking major happens; do not speculatively build migrations.
- **State graduation** (D21) — no path today for moving a state's users, drafts, chat history, NOFOs
  and KB content from the shared deployment into their own. Cognito passwords cannot be exported, so
  this needs a migration Lambda or re-registration. Design it against a real state's real data when
  one asks; do not build it speculatively.
- **Naming collision** — the Lambda layer already vendors a package called `grantwell-shared`
  (auth/sanitization helpers). Unpublished and layer-local, so no npm conflict, but rename it during
  Phase 3 so two different things do not share the name.
- **CDK patch cadence** (D17a) — pinned peers make us the bottleneck for `aws-cdk-lib` security
  patches. The scheduled bump PR is necessary but not sufficient; someone has to merge it promptly.
