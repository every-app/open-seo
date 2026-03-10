# OpenSEO

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay by usage alternative that you actually control.

![OpenSEO demo (placeholder)](https://github.com/user-attachments/assets/6a928771-66ff-486b-b131-a54a3943985f)

## Table of Contents

- [Why Use This](#why-use-this)
- [Main SEO Workflows](#main-seo-workflows)
- [Roadmap](#roadmap)
- [Community](#community)
- [Pricing / Costs (Free + API costs)](#pricing--costs)
- [Self Hosting (Deploy on Cloudflare) \[5-10 minutes\]](#self-hosting-deploy-on-cloudflare-5-10-minutes)
- [Docker Self Hosting (Standalone OpenSEO)](#docker-self-hosting-standalone-openseo)
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

## Self Hosting (Deploy on Cloudflare) [5-10 minutes]

> [!TIP]
> If anything in this section is confusing or unfamiliar like running terminal commands, copy this link into ChatGPT or Claude and ask it explain.

OpenSEO is built on [Every App](https://github.com/every-app/every-app), a platform for easily self-hosting open source apps like OpenSEO in your own Cloudflare account. Cloudflare enables much more powerful functionality than is possible running on your own computer or on a VPS.

_Windows Users_

This has not been tested on Windows. Please let me know if you run into problems. Using WSL will likely work better. Also, try using [fly.io Sprites](https://sprites.dev/) to get a linux sandbox for free if you get totally stuck.

### Video Walkthrough

This video walks through setting up the Gateway and self hosting OpenSEO. If you run into any problems, reference the [Community](#community) section for how to reach out.

https://github.com/user-attachments/assets/e40d5089-971f-43c9-85ff-1213aea35156

### Prerequisites

If you don't want to make a Cloudflare account yet (its easy!) and just want to test out OpenSEO, skip to the [Run Locally](#seo-api-cost-reference) section.

1. Install [Node.js](https://nodejs.org/) (includes `npx`).
2. Create a Cloudflare account: [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
3. Authenticate Wrangler:

```sh
npx wrangler login
```

4. Deploy the Every App Gateway (one-time per account):

```sh
npx everyapp gateway deploy
```

5. Create an Account

- Follow the link output by the last command to create an account. You will access OpenSEO through this account.

### Self Host OpenSEO

Deploy the app to cloudflare.

1. Clone the repo to your machine

```sh
git clone https://github.com/every-app/open-seo.git
```

2. Switch to the directory

```sh
cd open-seo
```

3. Self host via the Every App CLI

```sh
npx everyapp app deploy
```

#### DataForSEO API Key Setup [5 minutes]

OpenSEO use DataForSEO to get the SEO info. You need an API key to connect OpenSEO to the service.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access).
2. Request API credentials by email (`API key by email` or `API password by email`).
3. Use your DataForSEO login + API password, then base64 encode `login:password`:

```sh
printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64
```

4. Set this as a secret in Cloudflare. Use the value from the previous step when prompted.

```sh
npx wrangler secret put DATAFORSEO_API_KEY
```

Now you're all set! Go back to the gateway, click on the OpenSEO app, and start getting better at SEO!

## Docker Self Hosting (Standalone OpenSEO)

Quickstart:

1. `cp .env.example .env`
2. Set `DATAFORSEO_API_KEY` in `.env`
3. `docker compose up --build`
4. Open `http://localhost:3001`

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
# This runs in BYPASS_GATEWAY mode so that you don't need to set up the Every App gateway. This is fine for local use and best for local dev / quick testing since you don't need to access the app through the gatway
pnpm dev:agents
```

`pnpm dev` runs on `http://localhost:3001` by default (or `PORT` from `.env.local`).

`pnpm dev:agents` runs through portless at `http://open-seo.localhost:1355` by default.

When using a git worktree, portless prefixes the branch name, for example `http://feature-name.open-seo.localhost:1355`.

Running locally is the fastest way to test core flows. In the future, local mode will not include some Cloudflare-backed capabilities (for example cron-based rank tracking and infrastructure-powered performance improvements for heavier audits).

### Local Development (In Gateway)

If you want auth or any other gateway only features enabled for local dev, you must access through your Gateway and set a devUrl on the app.

See the next section which is a workflow for agents which works much better with worktrees and doens't require the Gateway.

```sh
# This configures your .env.local, installs dependencies and runs migrations against your local database.
npx everyapp app setup-local

# terminal 1: start once and keep running
pnpm dev:agents
```

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
