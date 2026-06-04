<img width="840" height="400" alt="Image" src="https://github.com/user-attachments/assets/14351615-2008-4f80-817d-8aaef25aa71a" />

# OpenSEO

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay-as-you-go alternative that you actually control.

Easy to self-host, fork and extend, but we have a managed version too:

[openseo.so](https://openseo.so)

## Why use OpenSEO?

- Best in class MCP and AI Skills.
- Modern, simple UI.
  - Focused workflows instead of a bloated, complex SEO suite.
- No subscriptions.
  - Bring your own DataForSEO API key and pay only for what you use.
- Fork and vibe code your own custom tool.

<img width="1385" height="794" alt="Image" src="https://github.com/user-attachments/assets/fd208249-44ea-4849-bb4b-5fc896aeab73" />

## Table of Contents

- [Why use OpenSEO?](#why-use-this)
- [Main SEO Workflows](#main-seo-workflows)
- [OpenSEO MCP](#openseo-mcp)
- [OpenSEO Agent Skills](#openseo-agent-skills)
- [Roadmap](#roadmap)
- [Community](#community)
- [Pricing / Costs (Free + API costs)](#pricing--costs)
- [DataForSEO API Key Setup](#dataforseo-api-key-setup)
- [Google Search Console](#google-search-console)
- [Self-hosting](#self-hosting)
  - [Docker Self Hosting](#docker-self-hosting)
  - [Cloudflare Self-Hosting](#cloudflare-self-hosting)
- [Local Development](#local-development)
- [Contributing](#contributing)
- [SEO API Cost Reference](#seo-api-cost-reference)

## Main SEO Workflows

- Keyword research
  - Find topics worth targeting, estimate demand, and prioritize what to write next.
- Rank tracking
  - Monitor keyword positions across desktop and mobile over time, with SERP feature detection.
- Domain insights
  - Understand where your domain is gaining or losing visibility so you can focus on the pages that move revenue.
- Backlinks
  - See who links to your site, which pages attract links, and where links are newly won or lost.
- Site Audits
  - Catch technical issues early so your site is easier for search engines to crawl and rank.
- AI brand visibility
  - See how your brand appears in AI answers, including competitor mentions and source coverage.
- AI search prompt explorer
  - Track and explore the prompts people might use when they ask AI tools for recommendations in your market.

## OpenSEO MCP

OpenSEO exposes an MCP server so AI agents can use your SEO data directly.

Connect Codex, Claude Code, Claude Desktop, or another MCP client to:

- Run keyword research
- Inspect SERPs
- Compare domains
- Review backlinks
- Work through SEO decisions from your editor or chat

In the app, open **AI & MCP** and copy your MCP server URL. Point your agent at whichever OpenSEO instance you use.

Hosted app:

```sh
codex mcp add openseo --url https://app.openseo.so/mcp
claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp
```

Cloudflare self-hosted:

```sh
codex mcp add openseo --url https://your-openseo-domain.com/mcp
claude mcp add --transport http --scope user openseo https://your-openseo-domain.com/mcp
```

Local Docker:

```sh
codex mcp add openseo --url http://localhost:3001/mcp
claude mcp add --transport http --scope user openseo http://localhost:3001/mcp
```

Approve the OpenSEO login when your agent asks.

## OpenSEO Agent Skills

OpenSEO Agent Skills are reusable workflows for Codex and Claude Code. They guide your agent through SEO tasks and can use the OpenSEO MCP for live keyword, SERP, backlink, and domain data.

### Installation Options

Install with `skills add`:

```sh
npx skills add every-app/open-seo
```

Auto-accept each OpenSEO skill:

```sh
npx skills add every-app/open-seo --skill '*'
```

Install for Claude Code only:

```sh
npx skills add every-app/open-seo --skill '*' --agent claude-code
```

Install for OpenAI Codex only:

```sh
npx skills add every-app/open-seo --skill '*' --agent codex
```

You can also pick skills directly from the GitHub repo and copy them into your agent's skills folder:

```sh
git clone https://github.com/every-app/open-seo.git

# Codex
mkdir -p ~/.codex/skills
cp -R open-seo/.agents/skills/* ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R open-seo/.agents/skills/* ~/.claude/skills/
```

Start with `/seo-project-setup`. It will ask about your project and help configure your workspace.

### Available Skills

- `seo-project-setup`
- `seo-coach`
- `keyword-research`
- `keyword-clustering`
- `competitive-landscape`
- `competitor-analysis`
- `link-prospecting`

## Roadmap

Top priorities:

- Google Search Console Integration + MCP
- Local SEO
- Custom Reports for Clients
- Improved and Scheduled Site Audits
- In App AI Agent
- Support Multiple Projects

Our top priority is always refining the current product and making existing features better based on user feedback.

If something important is missing, please join the [Discord](https://discord.gg/c9uGs3cFXr) or email me at ben@openseo.so and request it.

## Community

Email me: ben@openseo.so

Join Discord to chat: [Discord](https://discord.gg/c9uGs3cFXr)

Follow along for updates:

- Sign up for the mailing list on our website: [openseo.so](https://openseo.so)
- Follow on X: https://x.com/bensenescu

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

## Google Search Console

Search Console is optional and works in self-hosted deployments using your own
Google OAuth client. It takes ~10 minutes of one-time setup — see
[`docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).

## Self-hosting

OpenSEO supports two self-hosting paths:

- Docker for personal use and testing (Recommended for local use).
- Cloudflare for internet-facing self-hosting across multiple devices or for your team.

_Docker_

Docker is recommended for getting started. It's super easy to get up and running once you install Docker.

_Cloudflare_

If you love OpenSEO and want to use it across multiple devices or with your team, you can host it on Cloudflare which we'll be a SaaS-like experience. Also, this will have automatic database backups and other nice convenience features. It's just a bit more effort to get started if you're unfamiliar with Cloudflare.

## Docker Self Hosting

> [!WARNING]
> By default, the Docker version is intended for local use only. It runs in single-user mode with no authentication. For internet-facing self-hosting, use Cloudflare (free plan compatible). Or read [`docs/SELF_HOSTING_DOCKER.md`](./docs/SELF_HOSTING_DOCKER.md) before exposing to the internet.

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

For more info, see [`docs/SELF_HOSTING_DOCKER.md`](./docs/SELF_HOSTING_DOCKER.md).

## Cloudflare Self-Hosting

### Deploy the Worker

Clicking this button opens a page to deploy OpenSEO in your Cloudflare account. If you do not have an account yet, it will take you to account creation first (OpenSEO works great on the free plan).

Reference these docs while deploying since the Cloudflare UI doesn't indicate what steps you need to take: [`docs/SELF_HOSTING_CLOUDFLARE.md`](./docs/SELF_HOSTING_CLOUDFLARE.md).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/every-app/open-seo)

## Local Development

See [`docs/LOCAL_DEVELOPMENT.md`](./docs/LOCAL_DEVELOPMENT.md).

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

- DataForSEO SERP API pricing: https://dataforseo.com/apis/serp-api/pricing
- DataForSEO Business Data API pricing: https://dataforseo.com/apis/business-data-api/pricing
- DataForSEO Keywords Data API pricing: https://dataforseo.com/apis/keywords-data-api/pricing
- DataForSEO Labs pricing: https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- DataForSEO Backlinks pricing: https://dataforseo.com/pricing/backlinks/backlinks
- DataForSEO Lighthouse API docs: https://docs.dataforseo.com/v3/on_page/lighthouse/overview/

### 1) Rank tracking

There are in-app estimates for this since its dependent on the settings you select.

$2/month example:

- 50 keywords
- 1 device (Mobile or Desktop)
- Search 5 pages deep.

Searching ten pages deep costs 8x more than one page. Tracking both devices costs 2x more.

### 2) Site audit

- $0.01 per 20 pages audited with Lighthouse

### 3) Keyword research (`related` mode)

- Current billed cost pattern (from account usage logs):
  - `0.02 + (0.0001 x returned_keywords)` USD
- Default app setting: `150` results per search (`$0.035` each).
- Available result tiers:
  - 150 results = `$0.035`
  - 300 results = `$0.05`
  - 500 results = `$0.07`

### 4) Domain overview

- Standard domain overview request (with top 200 ranked keywords): `$0.0401` per domain.
- General formula if needed:
  - `0.0201 + (0.0001 x ranked_keywords_returned)` USD

### 5) Backlinks search

> [!NOTE]
> There is a 2 week free trial, but then DataForSEO requires a $100/month commitment for this API. You can access this data for just $10/month through [openseo.so](https://openseo.so). Soon, we'll let you use an OpenSEO API key so that you can call our API from your self hosted instance.

- Backlinks search costs about `$0.06` for a domain or `$0.04` for a page.
- Opening extra tabs like `Referring Domains` or `Top Pages` adds about `+$0.02` each.
- Exact cost can vary slightly based on returned rows and DataForSEO pricing.

### Planning examples

- 100 keyword research requests at the default 150 results: `$3.50`
- 100 keyword research requests at 500 results each: `$7.00`
- 100 domain overviews (200 ranked keywords each): `$4.01`
- 100 backlinks domain searches at current defaults before opening extra tabs: about `$6.34`
- 100 backlinks page searches at current defaults before opening extra tabs: about `$4.30`
- 100 fully explored backlinks domain searches: about `$10.94`
- 100 fully explored backlinks page searches: about `$8.61`
