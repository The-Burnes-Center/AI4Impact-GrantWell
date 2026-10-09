# GrantWell instance

This repo deploys one GrantWell instance: your configuration plus two release artifacts.

| Path | What it is |
|---|---|
| `vendor/grantwell-core-<version>.tgz` | Infrastructure (CDK), Lambdas and step functions |
| `vendor/grantwell-ui-<version>.tgz` | Web app source, built with your branding at deploy time |
| `config/instances.ts` | One entry per deployment (for example staging and prod) |
| `config/branding.ts` | Name, colors, logos, footer links |
| `public/` | Your own images (logo, favicon, partner logos), served from the site root |
| `bin/app.ts` | CDK entry point. Don't edit it. |
| `scripts/` | `install.sh`, `upgrade.sh`, `check-models.sh` and their helpers. Don't edit them: upgrade.sh replaces them with each release's copy. |
| `.github/workflows/deploy.yml` | Checks every push; deploys when you run it by hand, then checks every Bedrock model answers |
| `.github/workflows/upgrade.yml` | Weekly: opens a pull request when a newer GrantWell release is out |

Commit `vendor/`. The .tgz files are your exact deployed version.

## Start a new instance
1. On the template repo, click **Use this template** > **Create a new repository**. Make it private, in your own organization. Don't fork the template: your repo is yours, and updates arrive as releases (see Upgrade).
2. Use two AWS accounts, one for staging and one for prod. In each, run `cdk bootstrap` once for your region.
3. In each account, turn on Amazon Bedrock model access in your region for Claude Sonnet 5.5, Claude Haiku 5.5, Cohere Rerank 3.5 and Amazon Titan Text Embeddings V2. Without it, grant processing, chat and application writing fail with an access error.
4. In each account, create an IAM role that GitHub OIDC may assume, trusting only your repo and that deployment's Environment (`repo:<org>/<repo>:environment:<aws.environment>`). The role needs to assume the CDK bootstrap roles, and `lambda:InvokeFunction` on `grantwell-<id>-model-canary` (`<id>` from `config/instances.ts`) for the check after each deploy.
5. Edit `config/instances.ts` (one entry per deployment; the example has `example-staging` and `example-prod`) and `config/branding.ts`. List your deployments in `.github/workflows/deploy.yml`.
6. Set up GitHub Environments and secrets (see Deploy), then follow Set up below.
7. Deploy staging first, and deploy prod once staging works.

Until you commit `vendor/`, each push runs a trial install in Actions. It shows whether your config installs and synths.

## Set up
1. Edit `config/instances.ts` and `config/branding.ts`.
2. Run `scripts/install.sh`. It installs the release `package.json` points at (or pass a version, for example `scripts/install.sh 3.0.0`). It downloads that release, checks its SHA256SUMS, puts both .tgz files in `vendor/`, installs them (writing `package-lock.json`), typechecks your config and generates templates for every deployment (in `cdk.out/install/`).
3. Commit `vendor/`, `package.json` and `package-lock.json`.

## Images
Put your own images in `public/` and point `config/branding.ts` at them by their site-root path: `public/images/brand/logo.svg` is `/images/brand/logo.svg`. A file can't replace one the GrantWell UI already ships (the synth fails on a clash), and the synth also fails if a branding image path doesn't exist. The example branding points at placeholders in `public/images/brand/`; replace them with your own.

## Sign-in options
- **Single state:** with `tenancy: "single"`, every user belongs to that one state. Sign-up, Profile and User Management never offer a state choice, and there is no Platform Admin role. Users who already exist get the state at their next sign-in; to set it for everyone at once after the first deploy, run `node packages/core/scripts/backfill-single-state.mjs --user-pool-id <pool> --state <code>` from a GrantWell source checkout (dry run first, then `--apply`).
- **Two-step verification (MFA):** your choice per deployment: `mfaRequired: true` makes every user set up an authenticator app, `false` leaves it optional, and `mfa: "off"` turns it off.
- **Bot check:** sign-up and sign-in use Cloudflare Turnstile unless `auth: { turnstile: false }`. With it off, no Turnstile keys are needed.
- **Email:** `email: { cognitoDefault: true }` sends sign-in mail from Cognito's own sender when your account has no SES set up (about 50 a day); grant digest emails are then off.

## Search engines
Your site is hidden from search engines until you set `seo: { indexable: true }` on a prod deployment in `config/instances.ts`; dev deployments are always hidden. Set the home page title, description and a 1200×630 share image under `seo` in `config/branding.ts`. GrantWell generates `robots.txt`, `sitemap.xml`, `manifest.json` and `llms.txt` from your config, so don't put those in `public/` (the synth fails if you do).

## Upgrade
Once a week, `.github/workflows/upgrade.yml` runs `scripts/upgrade.sh` for the newest release and opens a pull request if it passes. Turn on Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests" for this. upgrade.sh swaps the release and refreshes `scripts/` from it; the PR links to what changed in the template's other files (workflows, README), which you copy by hand.

To upgrade by hand, run `scripts/upgrade.sh <version>`, for example `scripts/upgrade.sh 3.0.0`. It downloads that release, checks its SHA256SUMS, swaps `vendor/`, refreshes `scripts/`, reinstalls, typechecks, lists which generated templates the upgrade changes (templates in `cdk.out/upgrade/`) and runs the contract checks (below). If a step fails, it restores `vendor/`, `scripts/`, `package.json` and `package-lock.json`. Review `git diff`, then commit those four.

If your config already uses an option the new release adds, the current version can't generate templates from it: upgrade.sh warns and carries on without the before/after comparison and the stateful-resource check.

### Contract checks
`node_modules/.bin/grantwell-check <templates dir>` checks what a release needs from your repo beyond a typecheck. install.sh, upgrade.sh and the Deploy workflow's check job run it. It fails when:

- `chrome/` targets another chrome API version, uses a `--gw-*` style variable the release doesn't have, or doesn't type-check against the release's chrome API (it installs the UI's dependencies in a temporary folder for this);
- a deployment's generated root template has no `ModelCanaryFunctionName` output;
- `scripts/` differs from the release's copy (`grantwell-check --sync-scripts` restores it);
- on an upgrade, a user pool, table, bucket, vector collection or knowledge base would be removed or replaced;
- `config/` still holds the template's example values (install.sh only warns).

It warns when `.github/workflows/deploy.yml` lacks a step the template's has.

Downloads need no GitHub account. If the source repo is ever private, set `GITHUB_TOKEN` to a token with read access to it.

## Deploy
With GitHub Actions: in Settings > Environments, create one Environment per deployment, named after its `aws.environment`, holding the secrets `AWS_ROLE_ARN` (an IAM role GitHub OIDC may assume), `GRANTS_GOV_API_KEY`, `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` (only when Turnstile is on, the default) and the variable `AWS_REGION`. List the deployments in `.github/workflows/deploy.yml`'s `deployment` options. Then Actions > Deploy > Run workflow. Add required reviewers to an Environment to make its deploys wait for approval.

By hand, deploys need Docker, AWS credentials for the target account, and these environment variables:

- `ENVIRONMENT`: the `aws.environment` of the deployment to deploy
- `GRANTS_GOV_API_KEY`
- `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY`, unless the deployment sets `auth: { turnstile: false }`

Then run:

```
npx cdk deploy <aws.stackName> --require-approval never --outputs-file cdk.out/outputs.json
scripts/check-models.sh cdk.out/outputs.json
```

The second command makes one minimal call to every Bedrock model the deployment uses and fails if any doesn't answer. The workflow runs it after every deploy; the same check also runs daily and alarms.

## Rules
- Never change an `aws.*` value after the first deploy. Those values name real AWS resources, so changing one replaces them and loses data.
- Never change `instance` or `stage` after the first deploy either. Core tags every resource with `Project`, `Instance` and `Stage`, and the vector collection's tags can't change once it exists. Put any extra tags in `tags`.
- Keep secrets in environment variables only, never in `config/`.
