# Baseline, 2026-10-21

What GrantWell scores today (3.3.1, staging `5545054`) and what the parked pipeline candidate (`parked/pipeline-cand-3.2.0`, `edb7584`) scores, on the 30-grant golden set against the plan §5.2 bars. These numbers are in `baseline.json`; every later run's score report shows them in its Baseline column. Runs live in `eval/out/baseline-*` (not committed).

Extraction ran on all 30 grants, drafts on the 4 graded grants, chat on all 30 (95 questions, 3.3 only: the candidate does not change chat). The judge is Haiku 5.5 for matching and Sonnet 5.5 for chat and draft quality; a judgement counts only with evidence quoted from the output.

## Extraction and questions (30 grants)

| Bar | 3.3 | Candidate | Bar |
|---|---|---|---|
| Application due date exact | 0.80 (24/30) | **0.93** (28/30) | 1 |
| Due time and time zone as written | 0.68 (17/25) | 0.68 (17/25) | 1 |
| Eligibility precision / recall | 0.57 / 0.81 | 0.50 / 0.76 | 0.95 / 0.85 |
| Required documents precision / recall | 0.52 / 0.87 | 0.49 / 0.89 | 0.95 / 0.85 |
| Narrative sections recall | 0.74 | **0.92** | 0.95 |
| Grants with 0 sections | 1 (CO WSRF) | **0** | 0 |
| Duplicate section pairs (whole set) | 10 | 19 | ≤ 3 |
| Scored criteria found | 0.52 | 0.60 | 0.95 |
| Criteria points exact | 0.48 | **0.73** | 0.95 |
| Section limits captured | **0.92** | 0.75 | 0.9 |
| Format rules captured | 0.84 | 0.84 | 0.9 |
| Standard sections where the notice defers (NIH Specific Aims…) | 0.27 | **0.85** | 1 |
| Each scored criterion covered by a question | 0.55 | 0.68 | 1 |
| "Describe…" question share | 0.54 | **0.004** | ≤ 0.05 |
| Bedrock cost per grant | $0.160 | $0.222 (+39%) | ≤ $0.34 |
| Mean / max time per grant | 36 s / 77 s | 74 s / 132 s | p95 ≤ 3 min |

## Drafts (4 graded grants) and chat (30 grants)

| Bar | 3.3 | Candidate | Bar |
|---|---|---|---|
| Untraced numbers per draft | 6.25 | 6.5 | ≤ 1 |
| Cross-section contradictions per draft | 4.0 | 3.5 | ≤ 1 |
| Scored criteria addressed | 0.68 | 0.68 | 0.9 |
| Known traps handled (not gated) | 4/17 | 7/17 | — |
| Sections within limit | no measurable section | 1/1 | 1 |
| Chat answer correct | 0.85 (69/81) | — | 0.9 |
| Chat says "not stated" when absent | 1.0 (9/9) | — | 0.9 |
| Allowable-cost verdict (not gated) | 5/5 | — | — |

## What it says

- No bar is met by either version except cost and absent-answer chat. The rebuild's targets are far off: sections, criteria and drafting are the gaps the 10-16 review named, now measured.
- The candidate is a real step on sections, standard NIH sections, points, deadlines and questions, at +39% cost and twice the time. It also doubles duplicate sections (10 → 19) and loses on section limits (0.92 → 0.75) and eligibility precision. WS3 should fold it in with dedup and limit capture fixed.
- Drafting is the same in both (the candidate barely changes generate-section): six untraced numbers and four contradictions per draft, a third of scored criteria not addressed, fewer than half the traps caught. That is WS11's job.
- Precision is low everywhere because v1 writes long merged items and items the key leaves out ("should" items, advice). Some of that is key strictness, not pipeline error; the 10% spot check should look at precision misses first.

## Limits of this baseline

- Small draft set (4) and per-question paragraph limits are not measured. Only one draft section had a measurable limit.
- v1 has no fields for criteria, limits, award or format; those were found in its text, so v1 gets credit for stating them anywhere.
- Drafts replay Knowledge Base retrieval exactly only when the sections match the recorded run; these drafts were recorded fresh. Chat replays the recorded retrievals, falling back to the nearest recorded query when the model words its search differently.
- Citation, grants.gov cross-check and question-count bars wait for v2 output.
- The plan's 10% human spot check of judgements has not been done yet.

Cost of producing it: about $21.7. Runs: 3.3 $10.6 (one discarded draft replay included), candidate $7.4, three candidate draft attempts lost to harness bugs (fixed) $2.0. Judging $1.7.
