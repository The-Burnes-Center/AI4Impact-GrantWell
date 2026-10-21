# Eval harness

Runs GrantWell's real Lambda handlers on golden grants and records what each model call cost. Bedrock is live; S3, DynamoDB, API Gateway, Lambda and Cognito are stubbed, and any AWS call a runner does not route fails, so a run never writes to a deployment.

```
cd packages/core
AWS_PROFILE=530075910224_AdministratorAccess node eval/run.mjs extract
node eval/run.mjs questions --from eval/out/<extract run>
node eval/run.mjs draft --from eval/out/<extract run> --retrieval record --kb DMGPNNYLEA
node eval/run.mjs chat
```

| Runner | Calls | Needs |
|---|---|---|
| `extract` | extract-and-analyze, then synthesize (summary, deadline, questions) | `source/raw.txt` |
| `questions` | shared/questions.mjs on a fixed summary | `--from <extract run>` or `summary.json` |
| `draft` | prepare, then generate-section per section (Map concurrency 5) | `draft.json`; sections from it, `--from` or `summary.json` |
| `chat` | websocket-chat, one turn per question | `chat.json` |

Options: `--grant a,b` limits the slugs, `--concurrency` sets grants in parallel (default 2), `--golden` and `--out` move the input and output folders.

## Retrieval

Draft and chat read the dev Knowledge Base (`grantwell-burnes-staging-kb`, `DMGPNNYLEA`) only when recording. `--retrieval record` saves every Retrieve response to `golden/<slug>/recorded/retrieval.json`, `replay` (the default) serves them back, and `live` reads without saving. Draft queries replay exactly. Chat queries are written by the model, so a replay miss is served from the recorded query with the same filter that shares the most words, and counted under `retrieval.nearest`. Re-record after any retrieval change. The grant must be in the dev bucket under `grant.json`'s `name`. A draft's searches come from its section titles and descriptions, so drafts from a fresh extraction miss the recording; run those with `--retrieval record`.

## Golden grant

```
golden/<slug>/
  grant.json        {name, agency?}   name = the grant's NOFO folder in dev
  source/raw.txt    extracted text
  summary.json      optional; a fixed summary for questions and draft
  draft.json        {query, projectBasics, questionnaireAnswers, additionalInfo?, userState?, sections?}
  chat.json         [{id, question, history?}]
  recorded/retrieval.json
```

## Answer keys

`gold.json` holds what a correct extraction contains, in the shape the v2 summary will use (plan §2.3) so scorers compare like with like. Every item carries a verbatim `quote` from `source/raw.txt`; `page` is added once WS2 gives the text page numbers.

```jsonc
{
  "schemaVersion": 1,
  "status": "prelabeled | checked | confirmed",  // Claude pre-labels, a second agent checks, a person confirms (Q5; 2026-10-21: 4 graded + 6 sampled, by deciding every contested call)
  "family": "NIH | NSF | DOD | DOE | NASA | DOJ | EPA | DOT | DOI | AmeriCorps | CA state | CO state | MA state | foundation",
  "deadlines": [{"kind": "application | loi | preapp | other", "label": "", "date": "2026-11-02", "time": "20:59", "tzAsWritten": "ET",
                 "fromBrokenTable": false, "quote": ""}],
  "award": {"ceiling": 750000, "floor": null, "periodMonths": 36, "expectedAwards": {"min": 6, "max": 8},
            "range": {"min": 100000, "max": 25000000, "quote": ""},
            "caps": [{"what": "direct costs in any one year", "value": 200000}],
            "match": {"required": true, "ratio": "0.5", "appliesTo": "Category 1 only", "quote": ""}, "quote": ""},
  "sections": [{"name": "", "order": 1, "limit": {"type": "pages | words | chars | paragraphs", "value": 1, "per": "section | question"}, "conditional": null, "component": null, "quote": ""}],
  "criteria": [{"name": "", "scored": true, "points": 30, "weightPct": null, "scale": null, "sections": ["<section or libraryRequired name>"], "quote": ""}],
  "format": {"pageSize": null, "margins": null, "font": null, "fontSizePt": null, "lineSpacing": null, "overallPageLimit": null,
             "other": ["files must be Microsoft Office or unlocked PDF"], "quote": null},
  "eligibility": [{"item": "", "quote": ""}],
  "requiredDocuments": [{"item": "", "userWrites": true, "quote": ""}],
  "libraryRequired": ["Specific Aims"]  // standard sections the notice defers to a guide for
}
```

Rules:
- Only what the notice states. `null` means it does not say; never add up or infer a value (no `expectedAwards` summed from categories).
- A quote matches `raw.txt` after collapsing whitespace, so it may cross a line break. Aim for 8–40 words; shorter only when the source item itself is shorter.
- Points and percentage weights go in `points` or `weightPct`, never both. A rating scale ("scored on a 5-point scale") is not points: put it in `scale` and leave `points` null.
- Every criterion has `scored`. Review items the notice says are not scored (NIH "Additional Review Considerations", programmatic review, Likely/Unlikely selection considerations) are kept with `scored: false`; scorers rate criteria recall and points on the scored ones.
- `expectedAwards` is a number, `{"min", "max"}` for a stated range ("6-8", "up to 20" is `{"min": null, "max": 20}`), or `null`. An "expected funding range" goes in `award.range`; `floor` and `ceiling` hold only hard limits.
- NIH AIDS due dates removed by NOT-OD-26-029 are left out, even where the notice's table still prints them.
- One item per distinct requirement. A list of eligible organization types is one eligibility item.
- Dates rebuilt from a table the text extraction scrambled set `fromBrokenTable: true`, so a scorer can treat them as lower confidence.
- Budget narratives and justifications are `requiredDocuments` with `userWrites: true`, never `sections`. An applicant-written short description or abstract is a section.
- A section is prose the applicant drafts for this application. Biosketches, Current and Pending Support, title pages, tables of contents and forms are `requiredDocuments` (`userWrites: true` when the applicant prepares them). A plan with notice-specific instructions (resource sharing, data management) is a section; without them it goes in `libraryRequired`.
- NIH Research Strategy is one section per component, with the notice's own instructions in its quote, never split by review factor or unlimited sub-part. Parts the notice gives their own page limits (CTSA Elements A–E) stay separate.
- `libraryRequired` holds standard prose sections the notice defers to a guide (Specific Aims, Research Strategy, Project Summary, Resource Sharing Plan…). Biosketches, Current and Pending Support, Facilities, Equipment and Bibliography are `requiredDocuments` with `userWrites: true`.
- "Should", "encouraged" and "recommended" are not requirements: leave them out of `eligibility` and `requiredDocuments`; recommended page allowances go in `format.other`.
- When the notice contradicts itself, record each statement with its quote and set `"conflict": true` on each; scorers accept either value.
- Pass/fail screens and eligibility gates are criteria with `scored: false`.
- "Target", "typical" or "expected" amounts are `award.range`, never `ceiling`, `floor` or `caps`.
- Never infer sections the notice does not name. The "0 sections" bar counts `sections` plus `libraryRequired`; a key with both empty (an external application form, e.g. Gates, Prop 68) is exempt.
- A paragraph or word limit that applies to each question inside a section sets `limit.per: "question"`; otherwise `per` is "section" or absent.

## Scoring

`node eval/score.mjs <run dir>` scores a run against the answer keys and writes `score.json` and `score.md` into it: each plan §5.2 bar with its value, pooled counts, pass/fail and the baseline (`eval/baseline.json`, written by ws0-05). Dates and counts are compared in code. Haiku pairs extracted items with key items and finds key facts in the output; Sonnet grades chat answers and drafts. Every pair and every "found" must quote evidence that is really in the extraction, or it does not count. Each grant's judge decisions, with their evidence, are kept under `perGrant[].audit` for the 10% spot check. A v1 summary has no fields for criteria, limits, award or format, so those are looked for in its text and the report says so.

## Output

`eval/out/<runner>-<time>/` (gitignored) holds `<slug>.json` per grant, with the output, every model call (`stage`, `model`, `promptHash`, tokens, `stop`, `ms`) and its cost, plus `run.json` with the code sha, model ids and totals. Cost uses the US-profile prices in `lib/cost.mjs`. Model ids are read from `functions.ts`, so they always match the deployment.
