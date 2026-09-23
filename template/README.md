# GrantWell instance

This repo deploys one GrantWell instance: your configuration plus two release artifacts.

| Path | What it is |
|---|---|
| `vendor/grantwell-core-<version>.tgz` | Infrastructure (CDK), Lambdas and step functions |
| `vendor/grantwell-ui-<version>.tgz` | Web app source, built with your branding at deploy time |
| `config/instances.ts` | One entry per deployment (for example prod and dev) |
| `config/branding.ts` | Name, colors, logos, footer links |
| `bin/app.ts` | CDK entry point. Don't edit it. |

Commit `vendor/`. The .tgz files are your exact deployed version.

## Set up
1. Put both .tgz files from a GrantWell release into `vendor/`. Make sure the versions in `package.json` match them.
2. Run `npm install`. This writes `package-lock.json`, so commit it.
3. Edit `config/instances.ts` and `config/branding.ts`.
4. Run `npm run typecheck`.

## Deploy
Deploys need Docker, AWS credentials for the target account, and these environment variables:

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
