# Production deployment

The `Deploy production` GitHub workflow builds the dispatched `main` commit,
runs Postgres migrations, then deploys Alchemy stage `hosted-prod`. It runs only
when dispatched in `bensenescu/open-seo` on `main`; pushes and PRs never trigger
it. Runs serialize, and a newer dispatch does not cancel a running migration.

No production secret lives on a developer machine. Everything the deploy needs
is in the GitHub `production` environment; Cloudflare credentials, the database
URL, and the application secrets are exposed only to the steps that use them.

## One-time setup

Create a `production` environment in the repository settings and restrict its
deployment branches to `main`. Then add the following.

### Secrets

| Secret                       | Purpose                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`       | Alchemy deployment and remote state authentication                 |
| `POSTGRES_DATABASE_URL`      | Drizzle migrations against the same database Hyperdrive fronts     |
| `DATAFORSEO_API_KEY`         | base64 `login:password` (not the dashboard key)                    |
| `BETTER_AUTH_SECRET`         | Must be the existing value: it encrypts stored Google OAuth tokens |
| `CRAWLER_ACCESS_SECRET`      | Must be the existing value: it encrypts stored crawler signatures  |
| `GOOGLE_CLIENT_SECRET`       | Hosted Google sign-in and Search Console / GA4 OAuth               |
| `TURNSTILE_SECRET_KEY`       | Signup captcha verification                                        |
| `LOOPS_API_KEY`              | Transactional email and contact sync                               |
| `AUTUMN_SECRET_KEY`          | Billing                                                            |
| `AUTUMN_WEBHOOK_SECRET`      | Billing webhook verification                                       |
| `OPENROUTER_API_KEY`         | SAM chat agent (optional)                                          |
| `DUB_API_KEY`                | Referral tracking (optional)                                       |
| `CONTEXT_API_KEY`            | Site audit JavaScript rendering fallback (optional)                |
| `META_CONVERSIONS_API_TOKEN` | Meta ad signup attribution (optional)                              |
| `GDPR_ERASURE_SECRET`        | `scripts/erase-user-data.ts` endpoint (optional)                   |
| `GOOGLE_MAPS_API_KEY`        | Local SEO basemap tiles (optional)                                 |
| `WEB_BOT_AUTH_JWK`           | Private Ed25519 JWK that signs site audit requests (optional)      |

`WEB_BOT_AUTH_JWK` is one line of JSON (the whitespace check below rejects a
pretty-printed key). Generate it once with:

```sh
node -e 'crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]).then(k=>crypto.subtle.exportKey("jwk",k.privateKey)).then(j=>console.log(JSON.stringify({kty:j.kty,crv:j.crv,x:j.x,d:j.d})))'
```

The public half is served at `/.well-known/http-message-signatures-directory`,
which is the URL to give Cloudflare's Verified Bots submission form. Rotating
the key means re-submitting that form; Cloudflare matches signatures against
the keys it has on file.

Copy the current production values from the live worker before the first run.
Alchemy replaces the worker's complete var and secret set on every deploy, so a
secret missing from GitHub deploys as empty and silently disables that
integration. The workflow fails early if any required one is unset; the
optional ones simply turn their feature off.

The Cloudflare token needs the permissions the Alchemy stack already uses:
Workers scripts, D1, KV, R2, Workflows, custom-domain management, Account
Settings Read, and Secrets Store Read (Alchemy fetches its state-store token
from the account Secrets Store each run, so no extra GitHub secret is needed).

### Variables

| Variable                                | Value                                                      |
| --------------------------------------- | ---------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`                 | Production account ID                                      |
| `HYPERDRIVE_ID`                         | Existing `openseo` Hyperdrive configuration ID             |
| `GOOGLE_CLIENT_ID`                      | Existing Google OAuth client ID                            |
| `TURNSTILE_SITE_KEY`                    | Existing public Turnstile site key                         |
| `LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID`   | Verification template ID                                   |
| `LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID` | Password-reset template ID                                 |
| `LOOPS_TRANSACTIONAL_INVITATION_ID`     | Invitation template ID                                     |
| `LOOPS_PRODUCT_UPDATES_LIST_ID`         | Product-updates mailing list ID; optional                  |
| `META_PIXEL_ID`                         | Meta pixel ID for signup attribution; optional             |
| `POSTHOG_PUBLIC_KEY`, `POSTHOG_HOST`    | Existing analytics configuration; optional                 |
| `OPENROUTER_MODEL`                      | Optional model override                                    |
| `OPENROUTER_BASE_URL`                   | Optional OpenAI-compatible server instead of openrouter.ai |
| `OPENSEO_TELEMETRY_DISABLED`            | Optional telemetry setting                                 |

The workflow fixes `AUTH_MODE=hosted`, `DATABASE_PROVIDER=postgres`,
`BETTER_AUTH_URL=https://app.openseo.so`, and email verification enabled.

### Hyperdrive

Keep the existing `openseo` Hyperdrive configuration and copy its ID into
`HYPERDRIVE_ID`. Alchemy binds it to both Workers by ID rather than managing it,
so origin credentials, caching (keep it disabled), and the origin connection
limit (30) are changed in the Cloudflare dashboard, not in a deploy. The stack previously declared this
config as a managed resource with `RemovalPolicy.retain`; the first deployment
plan should show it being forgotten from state, not deleted.

## Trigger a deploy

Use Actions > Deploy production > Run workflow, or from any machine
authenticated to GitHub:

```sh
pnpm deploy:prod
```

The command queues the workflow and returns; follow the run in GitHub Actions.
It deploys the remote `main` commit, not uncommitted local changes. If migrations
succeed but the deploy fails, the schema changes remain, so keep migrations
compatible with the currently deployed app.

To rotate an application secret, update it in the GitHub environment and run the
workflow again. Rotating `BETTER_AUTH_SECRET` still needs a separate
data-encryption migration plan, as does `CRAWLER_ACCESS_SECRET`.

## If a deploy breaks production

Pick the fastest option that fits. Migrations are never rolled back; keep them
backward compatible so any of these is safe.

1. **Bad code, config unchanged.** Cloudflare dashboard > Workers > `open-seo`
   > Deployments > roll back to the previous version. Same for `open-seo-audit`
   > if it changed. Takes seconds. Alchemy state does not know about the
   > rollback, so the next workflow run redeploys whatever `main` is at.
2. **Bad commit.** `git revert` it on `main`, merge, then dispatch the workflow
   again. The workflow only deploys `main`, so this is the normal way to ship
   an older state.
3. **Workflow itself is broken.** Deploy from a machine that still has a
   `.env.production` (add `HYPERDRIVE_ID`; the `HYPERDRIVE_ORIGIN_*` lines are
   no longer read):

   ```sh
   pnpm build && pnpm alchemy deploy deploy/alchemy/alchemy.run.ts --env-file .env.production --stage hosted-prod --adopt
   ```

   The stack is identical, so this and the workflow can be used interchangeably.

## Website (openseo.so)

The marketing site in `web/` is a separate worker, `open-seo-landing`, deployed
by the `Deploy website` workflow with wrangler rather than Alchemy. It runs
automatically when a merge to `main` changes `web/**`, and can be dispatched by
hand:

```sh
pnpm deploy:web
```

It uses the same `production` environment and Cloudflare token. The only extra
value is the variable `WEBSITE_TURNSTILE_SITE_KEY`, the public site key of the
"OpenSEO - Marketing Site" Turnstile widget; `vite build` inlines it and refuses
to build without a real one. The worker's runtime secrets
(`TURNSTILE_SECRET_KEY`, `DATAFORSEO_API_KEY`, `LOOPS_API_KEY`,
`LOOPS_PRODUCT_UPDATES_LIST_ID`, `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`)
are not part of the workflow: wrangler keeps a worker's existing secrets across
deploys, so set or rotate them from `web/` with `wrangler secret put <NAME>`.

To roll back, use Cloudflare dashboard > Workers > `open-seo-landing` >
Deployments, or revert the commit on `main` (the revert redeploys on merge).
