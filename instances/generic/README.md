# GrantWell instance: Generic (grantwell.us)

Generic's prod (`grantwell-staging`) and dev (`grantwell-burnes-staging`) deployments, built from `template/` like any state. Prod deploys this folder as committed; dev deploys it with vendor/ rebuilt from source (see the root README).

| Path | What it is |
|---|---|
| `vendor/grantwell-core-<version>.tgz` | Infrastructure (CDK), Lambdas and step functions |
| `vendor/grantwell-ui-<version>.tgz` | Web app source, built with your branding at deploy time |
| `config/instances.ts` | One entry per deployment (for example prod and dev) |
| `config/branding.ts` | Name, colors, logos, footer links |
| `public/` | Your own images (logo, favicon, partner logos), served from the site root |
| `bin/app.ts` | CDK entry point. Don't edit it. |
| `scripts/` | `install.sh`, `upgrade.sh` and their helpers. Don't edit them. |

Commit `vendor/`. The .tgz files are your exact deployed version.

## Set up
Generic is already installed. `vendor/` holds the last GrantWell release: `scripts/release.sh prepare` rewrites it; dev deploys a source build instead (`scripts/pack.sh --dev`).

## Images
Put your own images in `public/` and point `config/branding.ts` at them by their site-root path: `public/brand/logo.svg` is `/brand/logo.svg`. A file can't replace one the GrantWell UI already ships (the synth fails on a clash), and the synth also fails if a branding image path doesn't exist.

## Upgrade
Run `scripts/upgrade.sh <version>`, for example `scripts/upgrade.sh 3.0.0`. It downloads that release, checks its SHA256SUMS, swaps `vendor/`, reinstalls, typechecks, and lists which generated templates the upgrade changes (templates in `cdk.out/upgrade/`). If a step fails, it restores `vendor/`, `package.json` and `package-lock.json`. Review `git diff`, then commit those three.

Downloads need no GitHub account. If the source repo is ever private, set `GITHUB_TOKEN` to a token with read access to it.

## Deploy
The source repo's `deploy-staging.yml` (dev) and `deploy-production.yml` (prod) deploy Generic. By hand, deploys need Docker, AWS credentials for the target account, and these environment variables:

- `ENVIRONMENT`: the `aws.environment` of the deployment to deploy
- `GRANTS_GOV_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY`

Then run:

```
npx cdk deploy <aws.stackName> --require-approval never
```

## Rules
- Never change an `aws.*` value after the first deploy. Those values name real AWS resources, so changing one replaces them and loses data.
- Keep secrets in environment variables only, never in `config/`.
