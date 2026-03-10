# OpenSEO

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay by usage alternative that you actually control.

![OpenSEO demo (placeholder)](https://github.com/user-attachments/assets/6a928771-66ff-486b-b131-a54a3943985f)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

## Table of Contents

- [Why Use This](#why-use-this)
- [Main SEO Workflows](#main-seo-workflows)
- [Roadmap](#roadmap)
- [Community](#community)
- [Pricing / Costs (Free + API costs)](#pricing--costs)
- [DataForSEO API Key Setup](#dataforseo-api-key-setup)
- [Self-hosting](#self-hosting)
  - [Cloudflare Deployment + Access Setup](#cloudflare-deployment--access-setup)
  - [Docker Self Hosting](#docker-self-hosting)
- [Local Development](#local-development)
- [Contributing](#contributing)
- [SEO API Cost Reference](#seo-api-cost-reference)

## Why Use This

- Open source and self-hostable.
- No subscriptions.
- Focused workflows instead of a giant, complex SEO suite.
- AI Native - Use your own tools like Claude Code / Cowork for more powerful AI features than what other platforms provide.

## Main SEO Workflows

- Keyword research
  - Find topics worth targeting, estimate demand, and prioritize what to write next.
- Domain insights
  - Understand where your domain is gaining or losing visibility so you can focus on the pages that move revenue.
- Site Audits
  - Catch technical issues early so your site is easier for search engines to crawl and rank.

## Roadmap

Top priorities:

- Rank tracking
- AI content workflows

If something important is missing, please join the [Discord](https://discord.gg/c9uGs3cFXr) or email me at ben@everyapp.dev and request it.

## Community

Email me: ben@everyapp.dev
Join discord to chat: [Discord](https://discord.gg/c9uGs3cFXr)

Follow along for updates:

- [r/everyapp](https://www.reddit.com/r/everyapp/)
- On X: https://x.com/bensenescu

## Pricing / Costs

OpenSEO is totally free to use. It works by using DataForSEO's APIs, which is a paid third-party service unaffiliated with OpenSEO.

There are two separate things:

1. OpenSEO app cost: $0, you host it yourself.
2. DataForSEO API: pay-as-you-go based on usage.

For cost estimates, see [DataForSEO API Cost Reference](#seo-api-cost-reference).

## DataForSEO API Key Setup

OpenSEO use DataForSEO to get the SEO info. You need an API key to connect OpenSEO to the service.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access).
2. Request API credentials by email (`API key by email` or `API password by email`).
3. Use your DataForSEO login + API password, then base64 encode `login:password`:

```sh
printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64
```

4. Set this as `DATAFORSEO_API_KEY` in your environment file:

- Docker self-hosting: `.env`
- Local development: `.env.local`

## Self-hosting

OpenSEO supports two self-hosting paths:

- Cloudflare for hosting on the internet (Recommended).
- Docker for your homelab or local use.

Use this quick guide:

- Choose Cloudflare when:
  - You've never used Docker before.
  - You want a more SaaS like experience.
  - You want to use it from multiple devices or with teammates.
  - You want support for more powerful features in the future like sharing public links to reports or site audits rendering your websites javascript.
- Choose Docker when:
  - You already have Docker installed and want to get setup most quickly.
  - You have a homelab setup.
  - You only want to use OpenSEO locally on one device.

## Cloudflare Deployment + Access Setup

You can use the Deploy button at the top of this README or run with Wrangler directly.

### 1) Deploy the Worker

Clicking this button will open a page to deploy OpenSEO in your Cloudflare account.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

### 2) Set required environment variables

OpenSEO needs these vars in production:

- `DATAFORSEO_API_KEY`: base64-encoded `login:password` from DataForSEO.
- `AUTH_MODE=cloudflare_access`
- `TEAM_DOMAIN`: your Access team domain (for example `https://your-team.cloudflareaccess.com`).
- `POLICY_AUD`: Access Application Audience tag for your OpenSEO app.

You can set plain vars and secrets with Wrangler:

```sh
pnpm exec wrangler secret put DATAFORSEO_API_KEY
pnpm exec wrangler secret put POLICY_AUD
pnpm exec wrangler secret put TEAM_DOMAIN
pnpm exec wrangler secret put AUTH_MODE
```

You can also set these in Cloudflare Dashboard under Worker Settings.

### 3) Configure Cloudflare Access

In Cloudflare Zero Trust:

1. Create an Access application for your OpenSEO route/domain.
2. Add policy rules for the identities/groups allowed to access OpenSEO.
3. Ensure requests to your Worker include `cf-access-jwt-assertion`.
4. Copy values into OpenSEO config:
   - Access team domain -> `TEAM_DOMAIN`
   - Access app AUD tag -> `POLICY_AUD`

### 4) Validate setup

- Visit your OpenSEO URL.
- You should be prompted by Cloudflare Access if not signed in.
- After sign-in, the app should load normally.
- If config is missing, OpenSEO shows an in-app setup error that links back to this section.

## Docker Self Hosting

Quickstart:

1. `cp .env.example .env`
2. Set `DATAFORSEO_API_KEY` in `.env`
3. `docker compose up`
4. Open `http://localhost:<PORT>` (default `3001`)

For runtime details, caveats, and troubleshooting, see [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md).

## Local Development

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- A DataForSEO account/API credentials

### Run Locally (Quick Test)

1. Copy env template:

```sh
cp .env.example .env.local
```

2. Install and run:

```sh
pnpm install
# Initialize local DB schema (required on a fresh machine)
pnpm run db:migrate:local
# This runs in local_noauth mode for local use and quick testing.
pnpm dev:agents
```

`pnpm dev` runs on `http://localhost:3001` by default (or `PORT` from `.env.local`) in `AUTH_MODE=local_noauth`.

`pnpm dev:agents` runs through [portless](https://github.com/vercel-labs/portless) at `http://open-seo.localhost:1355` by default.

When using a git worktree, [portless](https://github.com/vercel-labs/portless) prefixes the branch name, for example `http://feature-name.open-seo.localhost:1355`.

Running locally is the fastest way to test core flows.

### Local Development Workflow (for coding agents)

```sh
# This log file make it easier for your coding agent to debug.
mkdir .logs
touch .logs/dev-server.log
# Run once per fresh local DB
pnpm run db:migrate:local
# terminal 1: start once and keep running
pnpm dev:agents
```

- `pnpm dev:agents` mirrors output to `.logs/dev-server.log` (gitignored).
- The log file is overwritten on each run.

### Auth modes

- `AUTH_MODE=cloudflare_access` (default): validates Cloudflare Access JWTs (`cf-access-jwt-assertion`) using `TEAM_DOMAIN` + `POLICY_AUD`.
- `AUTH_MODE=local_noauth`: local trusted mode, no auth check, injects `admin@localhost`.
- `AUTH_MODE=hosted`: reserved for upcoming multi-tenant auth flow (not yet implemented).

Local scripts (`pnpm dev` and `pnpm dev:agents`) set `AUTH_MODE=local_noauth` automatically.
Use `AUTH_MODE=cloudflare_access pnpm dev` when you specifically want to test Access validation locally.

For Cloudflare deployments, ensure Cloudflare Access is enabled on your Worker route/domain and provide `TEAM_DOMAIN` + `POLICY_AUD` in environment variables.

### Database Commands

Generate migration:

```sh
pnpm run db:generate
```

Migrate local DB:

```sh
pnpm run db:migrate:local
```

## Contributing

Contributions are very welcome.

- Open an issue for bugs, UX friction, or feature requests.
- Open a PR if you want to implement a feature directly.
- Community-driven improvements are prioritized, and high-quality PRs are encouraged.

If you want to contribute but are unsure where to start, open an issue and describe what you want to build.

## SEO API Cost Reference

Use this section to estimate DataForSEO spend per request type. OpenSEO itself remains free; these are API usage costs only.

As of February 26, 2026, DataForSEO’s public docs/pricing pages say:

- New accounts include **$1 free credit** to test the API.
- The minimum top-up/payment is **$50**.

That means you can try OpenSEO for free with the starter credit, then decide if/when to top up.

### Pricing sources

- DataForSEO Labs pricing: https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- Google PageSpeed Insights API docs: https://developers.google.com/speed/docs/insights/v5/get-started

### 1) Site audit

- No paid API calls in the current implementation.

### 2) Keyword research (`related` mode)

- Current billed cost pattern (from account usage logs):
  - `0.02 + (0.0001 x returned_keywords)` USD
- Default app setting: `150` results per search (`$0.035` each).
- Available result tiers:
  - 150 results = `$0.035`
  - 300 results = `$0.05`
  - 500 results = `$0.07`

### 3) Domain overview

- Standard domain overview request (with top 200 ranked keywords): `$0.0401` per domain.
- General formula if needed:
  - `0.0201 + (0.0001 x ranked_keywords_returned)` USD

### Planning examples

- 100 keyword research requests at the default 150 results: `$3.50`
- 100 keyword research requests at 500 results each: `$7.00`
- 100 domain overviews (200 ranked keywords each): `$4.01`
