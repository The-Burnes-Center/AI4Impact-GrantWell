# E2E journeys (dev)

Playwright drives the deployed dev site (`grantwell-burnes-staging`) as one dedicated test account. It runs after every dev deploy (the `e2e` job in `deploy-staging.yml`) and nightly at 09:00 UTC (`nightly-e2e.yml`, once it is on `main`), both through `e2e-dev.yml`. Prod is never tested.

| Spec | Journey |
|---|---|
| `tests/auth.setup.ts` | Sign in with email, password and TOTP; clear the account's leftovers; pick the run's NOFO |
| `tests/nofo.spec.ts` | Search the NOFO, select it, read its four requirement tabs |
| `tests/chat.spec.ts` | Ask the assistant about the NOFO, check the answer and its sources, reload |
| `tests/draft.spec.ts` | Project basics → generate every narrative section → review → export Word and PDF |

AI output is checked by structure only: counts, lengths, headings, file types. Wording is never checked.

## The NOFO
Each run picks a random NOFO that is active, federal, open for at least 7 more days, and has narrative sections. The login journey logs the pick. To re-run with the same NOFO, set `E2E_NOFO_NAME`.

## The test account
`e2e-dev@grantwell.invalid` is a plain user with no role, no state and no digest subscription. `.invalid` is reserved (RFC 2606), so no email can reach anyone. The account has a completed profile and TOTP enrolled, and it persists across runs.

To create it, run:

```bash
read -rs TEMP_PASSWORD
aws cognito-idp admin-create-user --user-pool-id <dev pool> --username e2e-dev@grantwell.invalid \
  --user-attributes Name=email,Value=e2e-dev@grantwell.invalid Name=email_verified,Value=true \
  --message-action SUPPRESS --temporary-password "$TEMP_PASSWORD"
```

Then finish the setup in an ordinary browser on the dev site:
1. Sign in and set the permanent password.
2. Fill in the profile.
3. Turn on two-step verification from Profile, and keep the "Setup key".

## The Turnstile bypass
Turnstile runs on every password sign-in, and it refuses automated browsers. On dev only, the sign-in trigger skips the check when all of these hold:
- `E2E_BYPASS_PARAM` is set. CDK sets it only when the deployment's `InstanceConfig.e2e` is set, and validation refuses `e2e` on prod.
- The user's email is in `E2E_TEST_EMAILS` and ends in `@grantwell.invalid`.
- The token equals the SecureString `/grantwell-generic-dev/e2e/turnstile-bypass`.

Create that parameter out of band:

```bash
aws ssm put-parameter --name /grantwell-generic-dev/e2e/turnstile-bypass --type SecureString \
  --value "$(openssl rand -hex 32)"
```

Sign-up keeps the real check. `packages/core/test/e2e-bypass.test.ts` fails if the prod template names the parameter or gives any function an `E2E_` variable. In the browser, the suite replaces Cloudflare's `api.js` with a stub that hands the form the token.

## Secrets and AWS
| Where | Name | What |
|---|---|---|
| GitHub secret | `E2E_USER_PASSWORD` | The account's password |
| GitHub secret | `E2E_TOTP_SECRET` | The TOTP setup key; codes are computed with `otplib` |
| GitHub secret | `E2E_ROLE_ARN` | `GrantWell-Dev-E2E`: OIDC for `staging` and `main`, `ssm:GetParameter` on the bypass parameter only |

The suite reads the site URL from Generic's dev config (override with `E2E_SITE_URL`). It reads the user pool, app client and API endpoint from the site's `/aws-exports.json`.

## Traces
Failure traces are uploaded as the run artifact, and on this public repo anyone signed in to GitHub can download them. To keep secrets out of them:
- The login journey is never traced; it records only a screenshot and video, where the password field is masked.
- Every run ends with a Cognito `GlobalSignOut`, so any refresh token in a trace is already revoked.
- ID tokens expire after 15 minutes.

The saved session in `e2e/.auth/` is deleted when the run ends.

## Cleanup
The suite deletes only through the app's own APIs, as the test user. The handlers scope every call to the caller's `sub`, and the suite first checks that the token's email is the test address.
- **Start of each run:** delete every session and draft the account holds, and clear its recently viewed list.
- **Chat:** delete the session after the reply has finished saving.
- **Draft:** wait for the generation job to end, delete the draft, then delete it again 10 s later. The pipeline and the version writer can write after the first delete.

No journey uploads files: the user-documents bucket keeps every version.

Some data stays and expires on its own:
- analytics events (400 days);
- draft-job rows (1 h / 24 h);
- export PDFs (1 day).

## Running locally
```bash
cd e2e
npm ci
npx playwright install chromium
# AWS credentials for the dev account (to read the bypass parameter), plus:
export E2E_USER_PASSWORD=... E2E_TOTP_SECRET=...
npx playwright test
npx playwright show-report
```

A retried login waits for the next TOTP window, because Cognito refuses a code it has already accepted.
