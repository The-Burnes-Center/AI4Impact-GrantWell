# GrantWell instance

This repo deploys one GrantWell instance: your configuration plus two release artifacts.

| Path | What it is |
|---|---|
| `vendor/grantwell-core-<version>.tgz` | Infrastructure (CDK), Lambdas and step functions |
| `vendor/grantwell-ui-<version>.tgz` | Web app source, built with your branding at deploy time |
| `config/instances.ts` | One entry per deployment (for example prod and dev) |
| `config/branding.ts` | Name, colors, logos, footer links |
| `public/` | Your own images (logo, favicon, partner logos), served from the site root |
| `bin/app.ts` | CDK entry point. Don't edit it. |
| `scripts/` | `install.sh`, `upgrade.sh` and their helpers. Don't edit them. |
| `.github/workflows/deploy.yml` | Checks every push; deploys when you run it by hand |

Commit `vendor/`. The .tgz files are your exact deployed version.

## Set up
1. Edit `config/instances.ts` and `config/branding.ts`.
2. Run `scripts/install.sh <version>`, for example `scripts/install.sh 3.0.0`. It downloads that release, checks its SHA256SUMS, puts both .tgz files in `vendor/`, installs them (writing `package-lock.json`), typechecks your config and generates templates for every deployment (in `cdk.out/install/`).
3. Commit `vendor/`, `package.json` and `package-lock.json`.

## Images
Put your own images in `public/` and point `config/branding.ts` at them by their site-root path: `public/images/brand/logo.svg` is `/images/brand/logo.svg`. A file can't replace one the GrantWell UI already ships (the synth fails on a clash), and the synth also fails if a branding image path doesn't exist. The example branding points at placeholders in `public/images/brand/`; replace them with your own.

## Upgrade
Run `scripts/upgrade.sh <version>`, for example `scripts/upgrade.sh 3.0.0`. It downloads that release, checks its SHA256SUMS, swaps `vendor/`, reinstalls, typechecks, and lists which generated templates the upgrade changes (templates in `cdk.out/upgrade/`). If a step fails, it restores `vendor/`, `package.json` and `package-lock.json`. Review `git diff`, then commit those three.

Downloads need no GitHub account. If the source repo is ever private, set `GITHUB_TOKEN` to a token with read access to it.

## Deploy
With GitHub Actions: in Settings > Environments, create one Environment per deployment, named after its `aws.environment`, holding the secrets `AWS_ROLE_ARN` (an IAM role GitHub OIDC may assume), `GRANTS_GOV_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` and the variable `AWS_REGION`. List the deployments in `.github/workflows/deploy.yml`'s `deployment` options. Then Actions > Deploy > Run workflow. Add required reviewers to an Environment to make its deploys wait for approval.

By hand, deploys need Docker, AWS credentials for the target account, and these environment variables:

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
- Never change `instance` or `stage` after the first deploy either. Core tags every resource with `Project`, `Instance` and `Stage`, and the vector collection's tags can't change once it exists. Put any extra tags in `tags`.
- Keep secrets in environment variables only, never in `config/`.
