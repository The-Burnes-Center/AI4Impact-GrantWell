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

Draft and chat read the dev Knowledge Base (`grantwell-burnes-staging-kb`, `DMGPNNYLEA`) only when recording. `--retrieval record` saves every Retrieve response to `golden/<slug>/recorded/retrieval.json`, `replay` (the default) serves them back, and `live` reads without saving. Draft queries replay exactly. Chat queries are written by the model, so a replay miss is served from the recorded query with the same filter that shares the most words, and counted under `retrieval.nearest`. Re-record after any retrieval change. The grant must be in the dev bucket under `grant.json`'s `name`.

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

## Output

`eval/out/<runner>-<time>/` (gitignored) holds `<slug>.json` per grant, with the output, every model call (`stage`, `model`, `promptHash`, tokens, `stop`, `ms`) and its cost, plus `run.json` with the code sha, model ids and totals. Cost uses the US-profile prices in `lib/cost.mjs`. Model ids are read from `functions.ts`, so they always match the deployment.
