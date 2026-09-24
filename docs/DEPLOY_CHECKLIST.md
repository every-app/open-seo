# Deployment checklist for the developer

Goal: SEOShark running at your own domain on Cloudflare Workers with a
Supabase Postgres database, signup open in hosted mode. Budget roughly half a
day the first time. The detailed walkthrough is [`SETUP.md`](./SETUP.md);
this page is the ordered list of what to collect and run.

## 1. Accounts to create (owner)

| Account                  | Why                                                 | Plan needed                                       |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------- |
| Cloudflare               | Runs the app, audit worker, KV, R2, Workflows       | Free to start; enable R2 (needs a card on file)   |
| Domain on Cloudflare DNS | `app.<domain>` for the app, `<domain>` for the site | Move the zone to Cloudflare or register there     |
| Supabase                 | Postgres database                                   | Free for development; paid project for production |
| DataForSEO               | All SEO data                                        | Pay as you go; top up a balance                   |
| Google Cloud             | Google sign-in, Search Console, GA4                 | Free; OAuth consent screen must be published      |
| Loops                    | Verify, reset and invitation emails                 | Free tier is enough to start                      |
| Cloudflare Turnstile     | Signup captcha                                      | Free                                              |
| Autumn (with Stripe)     | Paid plans and credits                              | Only when you start charging                      |
| OpenRouter               | In-app SEO agent                                    | Optional, pay as you go                           |
| PostHog                  | Product analytics                                   | Optional                                          |

Give the developer access to each account, or collect the values below and
hand them over through a password manager. Never paste secrets in chat or
commit them.

## 2. Values to collect

| Value                                    | Where it comes from                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`                        | `https://app.<your-domain>`                                                                 |
| `BETTER_AUTH_SECRET`                     | Generate: `openssl rand -base64 48`                                                         |
| `DATAFORSEO_API_KEY`                     | `printf '%s' 'LOGIN:PASSWORD' \| base64` using the DataForSEO API login                     |
| Supabase transaction pooler URL          | Supabase → Connect → Transaction pooler (port 6543) → `DATABASE_URL`                        |
| Supabase session pooler host/user        | Same screen → Session pooler (port 5432) → `HYPERDRIVE_ORIGIN_*` values                     |
| Supabase direct URL                      | Same screen → Direct connection → `POSTGRES_DATABASE_URL` (migrations only)                 |
| `GOOGLE_CLIENT_ID` / `_SECRET`           | Google Cloud → APIs & Services → Credentials → OAuth client (Web application)               |
| `LOOPS_API_KEY`                          | Loops → Settings → API                                                                      |
| `LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID`    | Loops → Transactional → template exposing `appName`, `confirmationUrl`                      |
| `LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID`  | Template exposing `appName`, `resetUrl`                                                     |
| `LOOPS_TRANSACTIONAL_INVITATION_ID`      | Template exposing `appName`, `inviteUrl`, `organizationName`, `inviterName`, `inviterEmail` |
| `TURNSTILE_SITE_KEY` / `_SECRET_KEY`     | Cloudflare → Turnstile → widget for `app.<your-domain>`                                     |
| `AUTUMN_SECRET_KEY` / `_WEBHOOK_SECRET`  | Autumn dashboard, after the plans in step 6 exist                                           |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | OpenRouter → Keys (optional)                                                                |
| `POSTHOG_PUBLIC_KEY`, `POSTHOG_HOST`     | PostHog project settings (optional)                                                         |

Google OAuth settings: authorised redirect URI
`https://app.<your-domain>/api/auth/callback/google`; enable the Search
Console API and the Google Analytics Data API on the same project.

## 3. Brand and assets (before the first deploy)

- Edit `src/shared/brand.ts` and `web/src/lib/brand.ts` plus
  `web/src/lib/site-origin.js`: product name, domains, support email, GitHub
  URL. Search the skills and manifests for the placeholder values and replace
  them (command in `SETUP.md`), then run `pnpm sync-plugin-skills`.
- Replace the icons in `public/` and `web/public/`, and `name`/`short_name` in
  both `site.webmanifest` files.
- Publish `social-card.jpg` (1200x630) and the 512px icon on the marketing
  site at the paths set in the brand files.
- Set the real routes in `web/wrangler.jsonc`, fill the pricing page
  (`web/src/routes/_marketing/pricing.tsx`) and the legal entity in
  `web/content/legal/*`.

## 4. Database

```sh
cp .env.example .env.local
# set DATABASE_PROVIDER=postgres, DATABASE_URL, POSTGRES_DATABASE_URL
pnpm install --frozen-lockfile
pnpm db:migrate:pg
```

Details and the Hyperdrive option: [`DATABASE_SUPABASE.md`](./DATABASE_SUPABASE.md).

## 5. Deploy the app

```sh
pnpm alchemy login                 # enable access:write and query_cache:write scopes when asked
pnpm alchemy cloudflare bootstrap  # once per Cloudflare account
cp .env.production.example .env.production   # fill from step 2
pnpm deploy:postgres
```

The command migrates, builds and deploys both Workers with every binding and
the custom domain taken from `BETTER_AUTH_URL` (or `APP_DOMAINS`). Re-run it
for every release. Then deploy the marketing and docs site:

```sh
pnpm --dir web install --frozen-lockfile
pnpm --dir web run deploy
```

## 6. Billing (only when charging)

In Autumn create the features and products the code expects: metered feature
`seo_data_usage`, balance features for monthly and top-up credits, product
`base-plan` granting monthly credits, product `credit-top-up` selling credits.
Names are in `src/shared/billing.ts`. Point the Autumn webhook at
`https://app.<your-domain>/api/autumn/webhook`, then set the two Autumn
variables and redeploy. Without Autumn every account runs on the free-plan
defaults and DataForSEO usage is billed to you.

## 7. Verify

- Sign up with a real email, receive the verification email, sign in with
  Google.
- Create a project, run keyword research (paid call), start a site audit,
  add a rank tracker and trigger a manual check.
- Connect an MCP client to `https://app.<your-domain>/mcp`, complete the OAuth
  consent, run `whoami` and `list_projects`.
- Open a shared report link in a private window.
- Confirm the Loops contact was created and, if enabled, the Autumn customer.

## 8. Repository housekeeping (owner)

- GitHub → repository Settings: set the description and homepage to your
  product, decide on visibility (private is the usual choice for a commercial
  product), and use Danger Zone → Leave fork network if you want the fork
  label removed. Keep git history: it is what allows merging improvements
  from the origin codebase later (`maintainer-docs/UPSTREAM_SYNC.md`).
- Add repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `ENV_PREVIEW` and the variable `PR_PREVIEWS_ENABLED=true` when you want
  per-PR preview deployments.
- `LICENSE` stays as is in every copy of the code (MIT requirement).
