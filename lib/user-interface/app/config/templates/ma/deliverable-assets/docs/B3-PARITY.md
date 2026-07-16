# B3 — MA staging parity check

Goal: prove the frozen neutral engine + MA chrome behaves like the current MA app, on an ISOLATED
stack, before the engine ever touches live prod (`gw-stack-prod`).

## Safety invariant
The `ma-staging` instance uses distinct names — stack `grantwell-ma-staging`, Cognito
`gw-auth-ma-staging`, KB `knowledge-base-index-ma-staging` — and no account binding, so it CANNOT
collide with or mutate live MA prod. Never run the deploy with `GRANTWELL_INSTANCE=ma` here; that
targets prod.

## Deploy
Trigger `.github/workflows/deploy-ma-staging.yml` (manual `workflow_dispatch`). Prereqs:
- CI secret `SERVICE_ROLE_ARN_MA_STAGING` — an OIDC role in the target account with deploy rights.
- `GRANTS_GOV_API_KEY` secret.
- The target account is CDK-bootstrapped (the workflow runs `cdk bootstrap`).

The workflow selects `GRANTWELL_INSTANCE=ma-staging` + `GRANTWELL_CHROME=config/ma-chrome`, builds
the frontend, and `cdk deploy grantwell-ma-staging`.

## Parity checklist (compare staging vs current MA)
- [ ] App loads; MA Mayflower chrome renders: BrandBanner ("official website of the Commonwealth"),
      HeaderSlim with state seal, MA footer with mass.gov links.
- [ ] Sign-up / sign-in against the new Cognito pool; `custom:state`/`custom:role` claims present.
- [ ] NOFO list loads; a document opens; chat responds (KB index populated for staging).
- [ ] Draft generation runs end-to-end (Step Functions fan-out; sections return).
- [ ] DOCX + PDF export produce files.
- [ ] Admin dashboard reachable for an admin user.
- [ ] No console errors referencing missing branding/chrome/config.
- [ ] `cdk diff grantwell-ma-staging` is clean on a second deploy (idempotent).

## After parity passes
This validates the engine for MA. The live-prod swap (Phase D) is separate: deploy Cognito+S3
RETAIN first, then deploy `GRANTWELL_INSTANCE=ma` onto `gw-stack-prod` — same logical IDs, so
resources update in place. Do that in a scheduled change window, not casually.
