# Setup: from fork to first deployment

This guide takes a fresh clone to a running, branded deployment on your own
Cloudflare account with Supabase Postgres. Read it once, top to bottom; every
later doc assumes these steps are done.

## 0. What you are deploying

The app is a single Cloudflare Worker (TanStack Start SSR + API + MCP server)
plus a companion Worker for site audits. It uses Durable Objects (in-app
agent), Workflows (rank checks, audits), KV (OAuth tokens), R2 (audit
payloads) and a Postgres database. Everything except the database is
provisioned by one deploy command; the database is a Supabase project you
create.

Vercel is not a supported runtime today: the server code targets the Workers
runtime directly. What a Vercel port would involve is written up in
[`maintainer-docs/PLATFORM_VERCEL_SUPABASE.md`](../maintainer-docs/PLATFORM_VERCEL_SUPABASE.md).

## 1. Brand the product (one file)

Edit [`src/shared/brand.ts`](../src/shared/brand.ts). Every product name,
marketing/docs/legal link, support address and outbound identifier in the app,
emails and MCP server reads from it. Replace all `*.example` hosts. Then:

- Replace the icons in `public/` (`favicon*`, `android-chrome-*`,
  `apple-touch-icon.png`, `transparent-logo.png`) and update `name` /
  `short_name` in `public/site.webmanifest` (static JSON; keep it in sync with
  `brand.name` by hand).
- Host a `social-card.jpg` and the 512px icon at the URLs you set in
  `brand.ts`, on your marketing site.
- The agent skills and plugin manifests (`.agents/skills/`, `plugins/seoshark/`,
  `.claude-plugin/`, `.cursor-plugin/`) are static files installed into users'
  agents, so they carry the brand values literally. After changing `brand.ts`,
  search-and-replace the old name and hosts there and run
  `pnpm sync-plugin-skills`:

  ```sh
  grep -rlE "SEOShark|seoshark\.example" .agents/skills plugins .claude-plugin .cursor-plugin
  ```

- The `web/` directory is the marketing + docs site (a separate build). Set
  its domain in `web/src/lib/site-origin.js` and the routes in
  `web/wrangler.jsonc`, fill the pricing page where marked, and deploy it with
  `pnpm --dir web run deploy`. The app only needs the URLs in `brand.ts` to
  resolve.

## 2. Local development

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

In `.env.local` set `DATAFORSEO_API_KEY` (see
[`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md)) and
`AUTH_MODE=local_noauth`. For the default SQLite database run
`pnpm db:migrate:local`; to develop against Supabase follow
[`DATABASE_SUPABASE.md`](./DATABASE_SUPABASE.md). Then `pnpm dev`.

## 3. Create the Supabase project

Follow [`DATABASE_SUPABASE.md`](./DATABASE_SUPABASE.md) sections 1 to 3. You
end with the migrations applied and three values for the next step:
`DATABASE_PROVIDER=postgres`, `DATABASE_URL`, `POSTGRES_DATABASE_URL` (or the
`HYPERDRIVE_ORIGIN_*` set if you choose Hyperdrive).

## 4. Third-party services for a public product

`AUTH_MODE=hosted` turns on email/password + Google sign-in, organizations,
email verification, invitations and optional billing. Each needs credentials:

| Feature                             | Service                                    | Variables                                    | Required?      |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------- | -------------- |
| Session signing, token encryption   | none (generate: `openssl rand -base64 48`) | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`      | yes            |
| SEO data                            | DataForSEO                                 | `DATAFORSEO_API_KEY`                         | yes            |
| Google sign-in, Search Console, GA4 | Google Cloud OAuth client                  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`   | yes            |
| Verify / reset / invitation emails  | Loops                                      | `LOOPS_API_KEY`, `LOOPS_TRANSACTIONAL_*_ID`  | yes            |
| Signup captcha                      | Cloudflare Turnstile                       | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | recommended    |
| Credits, plans, checkout            | Autumn (Stripe underneath)                 | `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET` | for paid plans |
| In-app SEO agent (SAM)              | OpenRouter                                 | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`     | optional       |
| Product analytics                   | PostHog                                    | `POSTHOG_PUBLIC_KEY`, `POSTHOG_HOST`         | optional       |
| Referral tracking                   | Dub                                        | `DUB_API_KEY`                                | optional       |

Google OAuth redirect URI: `https://<your app host>/api/auth/callback/google`.
Search Console and GA4 need their APIs enabled on the same Google project (see
[`SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md)
and [`SELF_HOSTING_GOOGLE_ANALYTICS.md`](./SELF_HOSTING_GOOGLE_ANALYTICS.md)).

Loops templates must expose the data variables the app sends: `appName` and
`confirmationUrl` (verify), `resetUrl` (reset), and the invitation fields in
`src/server/email/loops.ts`.

## 5. Deploy to your Cloudflare account

Prerequisites: a Cloudflare account with R2 enabled (needs a payment method on
file even on the free tier), and your DNS zone for the app hostname on
Cloudflare.

```sh
pnpm alchemy login                 # enable access:write and query_cache:write scopes when asked
pnpm alchemy cloudflare bootstrap  # one-time state store in your account
cp .env.production.example .env.production   # fill in steps 3 and 4
pnpm deploy:postgres
```

`deploy:postgres` runs the Postgres migrations, builds, and deploys both
Workers with every binding (KV, R2, Durable Objects, Workflows, crons and the
custom domain from `BETTER_AUTH_URL` / `APP_DOMAINS`). Re-run it for every
release. Preview stages per pull request are described in
[`PREVIEW_DEPLOYMENTS.md`](./PREVIEW_DEPLOYMENTS.md); enable the workflow with
the `PR_PREVIEWS_ENABLED` repository variable once the secrets exist.

After the first deploy:

- Sign up, verify the email, and confirm the Google flows.
- Point an MCP client at `https://<your app host>/mcp` and complete the OAuth
  consent (the client name and icon come from `brand.ts`).
- Set the Autumn webhook to `https://<your app host>/api/autumn/webhook` if
  billing is enabled.
