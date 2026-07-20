# E1 — Upload clarity & reduced admin workload

Reframes milestone E1 from "unified lifecycle dashboard" to **give admins clarity on
what happens after they upload a NOFO, and stop making them rubber-stamp documents the
system already judged fine.**

## Problem

After an admin uploads a NOFO, the pipeline runs fully automatically
(`upload → SQS → extract → analyze → synthesize → validate → auto-publish | quarantine`),
but the UI exposes almost none of it:

1. **Black-box upload.** The upload modal says "grab a coffee," closes, and the only
   signal left is one ephemeral pill on the grant row. The backend writes an ordered
   `processing_status` the whole time — the UI discards it.
2. **Manufactured approval work.** `validate/index.mjs` only returns `PASS` when **all
   four** summary sections are non-empty. Missing even one → quarantine → mandatory
   manual approval — even for `partial_extraction` cases the system already flags
   `canApprove: true`. Those approvals are rubber-stamps.
3. **Three overlapping tabs.** Grants, Lifecycle (uncommitted), and Processing Review all
   narrate the same NOFO. Frontend also carries dead states (`detecting_sections`,
   `incomplete`) with no backend producer.

## Decisions (locked)

- Partial extractions (1–2 of 4 sections missing) **auto-publish with a non-blocking
  "review suggested" flag** instead of quarantining.
- Fold Lifecycle + Processing Review **into the Grants tab**; Grants becomes the single
  admin surface. Salvage `buildLifecycleRows`; delete the tab shells.

## PR breakdown

Three independent, separately-shippable, separately-revertable PRs. They don't depend on
each other; ship in this order by value/risk:

- **PR 1 — Backend gate + flag** (below). The workload win; lowest UI risk. Delivers most
  of the value on its own. Ship first, in isolation, so it can be validated and reverted
  independently of any UI change.
- **PR 2 — Upload stepper** (frontend, no backend dependency).
- **PR 3 — Tab merge + action collapse** (the consolidation).

## PR 1 — Backend gate + flag

### 1. Widen the publish decision, keep the verdict binary — `validate/index.mjs`
Do **not** introduce a third verdict (`PASS_WITH_WARNINGS`). That would force coordinated
changes across four layers (validate, the SFN Choice/CDK redeploy, publish, retrieve) to
carry one bit of information. Instead, keep `overallVerdict` binary and let the **routing
decision** widen. `partial_extraction` is already flagged `canApprove: true` in
`adminGuidance` — that's the signal. Validate still emits `adminGuidance` for the 1–2
missing case so the flag has a reason; the verdict stays `PASS`/`NEEDS_REVIEW`.

- 0 missing → `PASS`, no guidance (auto-publish, clean)
- 1–2 missing (`partial_extraction`) → `PASS`, **with** `adminGuidance` attached
  (auto-publish, flagged)
- ≥3 missing (`mostly_empty` / `incomplete_document`) → `NEEDS_REVIEW` (quarantine)

### 2. Route on the flag, not a new state — `step-functions/nofo-processing.ts:122-130`
`EvaluateValidation` still routes `PASS` → publish, `otherwise` → quarantine. Because
partials now emit `PASS`, they flow to publish with no Choice-state change beyond passing
`adminGuidance` through to the publish task. No new branch, no new condition string.

### 3. Persist the flag — `publish/index.mjs`
When publish receives a non-null `adminGuidance`, set a `review_flag` on the
`NOFOMetadataTable` record (e.g. `{ reason, missingCategories }`) alongside the normal
publish writes. Grant goes `active` immediately; flag is advisory only. Clean PASS (no
guidance) writes no flag.

### 4. Expose it — `retrieve-nofos/index.mjs`
Return `review_flag` on the NOFO list payload (next to `processing_status`).

### Safety valve (required, not optional)
Auto-publishing unreviewed content is only acceptable if it's **auditable and
reversible**:
- The flag must be **filterable**, not just a row badge — an admin must be able to answer
  "show me everything that went live without review" in one action (see PR 3, the Grants
  "Needs attention" filter). A badge alone is decorative.
- Confirm auto-published-partial grants still open in the existing summary editor so
  correction is a real path (they do — publish writes the same metadata record the editor
  reads).

*Consequence, acknowledged:* partial grants reach users unreviewed. The filter + editor
are what make that safe rather than silent.

## PR 2 — Upload-time stepper

### 5. Upload stepper — `NOFOsTab.tsx`
Replace the "grab a coffee" copy + lone pill with an ordered stepper driven by the
statuses the backend already writes:

```
Uploaded ✓ → Extracting text ✓ → Analyzing ● → Synthesizing ○ → Validating ○ → Published
```

- Keep upload feedback visible (modal or inline on the new row).
- **Polling must gate on in-flight work.** Poll `getNOFOs` (~5s) *only while some NOFO
  has a non-null `processing_status`*, and stop entirely when nothing is in flight — an
  idle Grants tab must not poll. Reuse the `hasInFlight` guard the existing
  `LifecycleTab.tsx:82-89` already got right (poll only when in flight); that guard is
  the one idea worth carrying forward from the Lifecycle work.
- Terminal resolution: **Published — live** (green) / **Published — review suggested**
  (amber, flagged) / **Needs review — <reason>** (deep-links to the inline review).
- Map only real backend statuses: `uploading, extracting_text, extracting,
  synthesizing, validating` + terminal `active/quarantined`. Drop `detecting_sections`
  and `incomplete` (no backend producer).

## PR 3 — Tab merge + action collapse

### 6. Merge tabs into Grants — `DashboardPage.tsx`, `NOFOsTab.tsx`
- Grants tab becomes the single admin surface. Rows carry live stage inline; rows needing
  review get a badge + inline expand reusing **`ReviewExpandedRow`** (unchanged).
- **Don't intermix triage rows with browse rows.** Grants is a browse/manage surface
  (pin, edit, deadlines); review is triage (approve/reject/reprocess). Keep them one tab
  but separate the *jobs* with a **"Needs attention" filter/segment** — a chip that shows
  only flagged (auto-published partials) + quarantined NOFOs. Default view stays the
  clean browse list. This is also the safety-valve filter PR 1 requires.
- Delete `LifecycleTab.tsx` and the standalone `ProcessingReviewTab.tsx` tab wiring in
  `DashboardPage.tsx`. Keep a pending-review **count badge** so nothing is lost.
- On `buildLifecycleRows`: after PR 1, most NOFOs sit in exactly one state (processing /
  live / rarely quarantined), so the three-vocabulary correlation it solves largely
  dissolves. Reuse it only if the merged filter still needs to reconcile an open review
  against a published row; otherwise inline the small amount of logic that remains and
  drop `lifecycle.ts`. Delete the two dead labels regardless.

### 7. Collapse the recovery actions — `ReviewExpandedRow.tsx` / `ReviewActions`
Surface **one recommended primary action** per failure `source`/guidance, secondary
actions behind "more":
- quality / scanned PDF → **Re-upload**
- duplicate → **Reject**
- transient pipeline error → **Reprocess**
- (`partial_extraction` no longer lands here — it auto-publishes)

## Out of scope
- No new DynamoDB table or user model (that's E2 / notifications).
- No change to extraction/synthesis logic itself.

## Resolved decisions
- Flag surfacing: **both** — a row badge on flagged grants, and a "Needs attention"
  filter chip that scopes the Grants list to flagged + quarantined (PR 3, §6). The filter
  is the auditable safety valve PR 1 depends on.
- Verdict shape: **binary** (`PASS`/`NEEDS_REVIEW`); partials publish via the routing
  decision + attached `adminGuidance`, not a new verdict state (§1).
