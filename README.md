# OpenSEO

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay-as-you-go alternative that you actually control.

![OpenSEO demo (placeholder)](https://github.com/user-attachments/assets/6a928771-66ff-486b-b131-a54a3943985f)

## Table of Contents

- [Why Use This](#why-use-this)
- [Main SEO Workflows](#main-seo-workflows)
- [Roadmap](#roadmap)
- [Community](#community)
- [Pricing / Costs (Free + API costs)](#pricing--costs)
- [DataForSEO API Key Setup](#dataforseo-api-key-setup)
- [Self-hosting](#self-hosting)
  - [Cloudflare Self-Hosting](#cloudflare-self-hosting)
  - [Docker Self Hosting](#docker-self-hosting)
- [Local Development](#local-development)
- [Contributing](#contributing)
- [SEO API Cost Reference](#seo-api-cost-reference)

## Why Use This

- Open source and self-hostable.
- No subscriptions.
- Focused workflows instead of a giant, complex SEO suite.
- AI-native: use your own tools like Claude Code / Cowork for more powerful AI features than other platforms provide.

## Main SEO Workflows

- Keyword research
  - Find topics worth targeting, estimate demand, and prioritize what to write next.
- Domain insights
  - Understand where your domain is gaining or losing visibility so you can focus on the pages that move revenue.
- Backlinks
  - See who links to your site, which pages attract links, and where links are newly won or lost.
- Site Audits
  - Catch technical issues early so your site is easier for search engines to crawl and rank.

## Roadmap

Top priorities:

- Rank tracking
- AI content workflows

If something important is missing, please join the [Discord](https://discord.gg/c9uGs3cFXr) or email me at ben@everyapp.dev and request it.

## Community

Email me: ben@everyapp.dev
Join Discord to chat: [Discord](https://discord.gg/c9uGs3cFXr)

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

OpenSEO uses DataForSEO to fetch SEO data. You need an API key to connect OpenSEO to the service.

Backlinks requires one more step beyond the API key: you also need DataForSEO Backlinks enabled on your account (trial or paid subscription), then confirm access from the Backlinks page in OpenSEO.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access).
2. Request API credentials by email (`API key by email` or `API password by email`).
3. Use your DataForSEO login + API password, then base64 encode `login:password`:

```sh
printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64
```

4. Set this as `DATAFORSEO_API_KEY` in your environment file:

- Docker self-hosting: `.env`
- Cloudflare: Set it in the workers UI
- Local development: `.env.local`

## Self-hosting

OpenSEO supports two self-hosting paths:

- Docker for your homelab or local use (Recommended).
- Cloudflare for use across multiple devices or for your team.

_Docker_

Docker is recommended for getting started. It's super easy to get up and running once you install Docker.

_Cloudflare_

If you love OpenSEO and want to use it across multiple devices or with your team, you can host it on Cloudflare which we'll be a SaaS-like experience. Also, this will have automatic database backups and other nice convenience features. It's just a bit more effort to get started if you're unfamiliar with Cloudflare.

## Docker Self Hosting

Prerequisites:

- Install Docker: https://www.docker.com/products/docker-desktop/

Quickstart:

1. `cp .env.example .env`
2. Set `DATAFORSEO_API_KEY` in `.env`
3. `docker compose up -d`
4. Open `http://localhost:<PORT>` (default `3001`)

By default, `compose.yaml` pulls the published image from GHCR:

- `ghcr.io/every-app/open-seo:latest`

To update to the newest published image, pull first and then restart:

```sh
docker compose pull
docker compose up -d
```

Or use a single command:

```sh
docker compose up -d --pull always
```

Use a pinned version tag in `.env` if preferred:

```sh
OPEN_SEO_IMAGE=ghcr.io/every-app/open-seo:v1.2.3
```

For more info, see [`docs/SELF_HOSTING_DOCKER.md`](./docs/SELF_HOSTING_DOCKER.md).

## Cloudflare Self-Hosting

### Deploy the Worker

Clicking this button opens a page to deploy OpenSEO in your Cloudflare account. If you do not have an account yet, it will take you to account creation first (OpenSEO works great on the free plan).

Reference these docs while deploying since the Cloudflare UI doesn't indicate what steps you need to take: [`docs/SELF_HOSTING_CLOUDFLARE.md`](./docs/SELF_HOSTING_CLOUDFLARE.md).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

## Local Development

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- A DataForSEO account/API credentials

### Local Development Workflow

```sh
pnpm install

# Run once per fresh local DB
pnpm run db:migrate:local
```

Configure .env.local:

1. `cp .env.example .env.local`
2. Add `DATAFORSEO_API_KEY` as a base64-encoded `login:password` value:

   `printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64`

Run Locally:

```sh
# Option 1
pnpm run dev

# Option 2 (Recommended)
# This log file makes it easier for your coding agent to debug.
mkdir .logs
touch .logs/dev-server.log

# This command uses portless, which is great for worktrees. It also pipes logs to that fixed file, which is helpful for agent debugging output.
pnpm dev:agents
```

`pnpm dev:agents` runs through [portless](https://github.com/vercel-labs/portless) at `http://open-seo.localhost:1355` by default.

When using a git worktree, [portless](https://github.com/vercel-labs/portless) prefixes the branch name, for example `http://feature-name.open-seo.localhost:1355`.

### Database Commands

Generate migration:

```sh
pnpm run db:generate
```

Migrate local DB:

```sh
pnpm run db:migrate:local
```

### Auth modes

- `AUTH_MODE=cloudflare_access` (default): validates Cloudflare Access JWTs (`cf-access-jwt-assertion`) using `TEAM_DOMAIN` + `POLICY_AUD`.
- `AUTH_MODE=local_noauth`: local trusted mode, no auth check, injects `admin@localhost`.
- `AUTH_MODE=hosted`: reserved for upcoming multi-tenant auth flow (not yet implemented).

Local scripts (`pnpm dev` and `pnpm dev:agents`) set `AUTH_MODE=local_noauth` automatically.
Use `AUTH_MODE=cloudflare_access pnpm dev` when you specifically want to test Access validation locally.

For Cloudflare deployments, ensure Cloudflare Access is enabled on your Worker route/domain and provide `TEAM_DOMAIN` + `POLICY_AUD` in environment variables.

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
- DataForSEO Backlinks pricing: https://dataforseo.com/pricing/backlinks/backlinks
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

### 4) Backlinks search

- Backlinks search costs about `$0.08` for a domain or `$0.04` for a page.
- Opening extra tabs like `Referring Domains` or `Top Pages` adds about `+$0.02` each.
- Exact cost can vary slightly based on returned rows and DataForSEO pricing.

### Planning examples

- 100 keyword research requests at the default 150 results: `$3.50`
- 100 keyword research requests at 500 results each: `$7.00`
- 100 domain overviews (200 ranked keywords each): `$4.01`
- 100 backlinks domain searches at current defaults before opening extra tabs: about `$8.38`
- 100 backlinks page searches at current defaults before opening extra tabs: about `$4.30`
- 100 fully explored backlinks domain searches: about `$12.98`
- 100 fully explored backlinks page searches: about `$8.61`
