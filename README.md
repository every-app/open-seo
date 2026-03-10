# OpenSEO

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay by usage alternative that you actually control.

![OpenSEO demo (placeholder)](https://github.com/user-attachments/assets/6a928771-66ff-486b-b131-a54a3943985f)

## Table of Contents

- [Why Use This](#why-use-this)
- [Main SEO Workflows](#main-seo-workflows)
- [Roadmap](#roadmap)
- [Community](#community)
- [Pricing / Costs (Free + API costs)](#pricing--costs)
- [DataForSEO API Key Setup](#dataforseo-api-key-setup)
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
# This runs in BYPASS_GATEWAY mode for local use and quick testing.
pnpm dev:agents
```

`pnpm dev` runs on `http://localhost:3001` by default (or `PORT` from `.env.local`).

`pnpm dev:agents` runs through portless at `http://open-seo.localhost:1355` by default.

When using a git worktree, portless prefixes the branch name, for example `http://feature-name.open-seo.localhost:1355`.

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
