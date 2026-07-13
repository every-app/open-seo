# OpenSEO

> Open source alternative to Semrush and Ahrefs

OpenSEO is an SEO tool for _the people_. If tools like Semrush or Ahrefs are too expensive or bloated, OpenSEO is a pay-as-you-go alternative that you actually control.

> All-in-one SEO tool for you and your AI agent.

Connect with any agent like Claude Code, OpenClaw or Hermes. We have pre-built skills, but you can build your own to tailor OpenSEO to your needs.

<img width="1385" height="794" alt="Image" src="https://github.com/user-attachments/assets/fd208249-44ea-4849-bb4b-5fc896aeab73" />

## Table of Contents

- [Why use OpenSEO?](#why-use-openseo)
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

## Hosted Version

If you're not interested in self hosting, or just want to support the project, we also have a hosted version:

[openseo.so](https://openseo.so)

## Why use OpenSEO?

- Best in class MCP and AI Skills.
- Modern, simple UI.
  - Focused workflows instead of a bloated, complex SEO suite.
- No subscriptions.
  - Bring your own DataForSEO API key and pay only for what you use.
- Fork and vibe code your own custom tool.

## Main SEO Workflows

- Keyword research
- Rank tracking
- Competitor Insights
- Backlinks
- Site Audits
- AI Visibility

## Community

Join Discord to chat: [Discord](https://discord.gg/c9uGs3cFXr)

Follow along for updates:

- Follow on X: https://x.com/bensenescu
- Sign up for the mailing list on our website: [openseo.so](https://openseo.so)

## OpenSEO MCP

OpenSEO exposes an MCP server so AI agents can use your SEO data directly.

Connect Claude Code, OpenClaw, Hermes or any other agent.

### Setup

- Set up the app
- Click "AI & Agents" in the header
- Follow the instructions to connect to your agent

## OpenSEO Agent Skills

OpenSEO Agent Skills are reusable workflows for your agent

They guide your agent through SEO tasks and use the OpenSEO MCP so your agent makes better recommendations.

### Available Skills

- `seo-project-setup`
- `seo-coach`
- `keyword-research`
- `keyword-clustering`
- `competitive-landscape`
- `competitor-analysis`
- `link-prospecting`

### Installation Guide

Read our docs for how to install the skills:

https://openseo.so/docs/skills/setup

## Roadmap

Top priorities:

- Improved and Scheduled Site Audits
- Custom Reports for Clients
- Local SEO
- In App AI Agent

Our top priority is always refining the current product and making existing features better based on user feedback.

If something important is missing, please join the [Discord](https://discord.gg/c9uGs3cFXr) or email me at ben@openseo.so and request it.

## Pricing / Costs

OpenSEO is totally free to use. It works by using DataForSEO's APIs, which is a paid third-party service unaffiliated with OpenSEO.

There are two separate things:

1. OpenSEO app cost: $0, you host it yourself.
2. DataForSEO API: pay-as-you-go based on usage.

For cost estimates, see [DataForSEO API Cost Reference](#seo-api-cost-reference).

## DataForSEO API Key Setup

OpenSEO uses DataForSEO to fetch SEO data. You need an API key to connect OpenSEO to the service.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access?aff=255379).
2. Click "Send by email" to get set your credentials.
3. Copy the longer crendentials labelled "Base64" credentials.
4. Set this as `DATAFORSEO_API_KEY` in your environment file:

- Docker self-hosting: `.env`
- Cloudflare: Set it in the workers UI
- Local development: `.env.local`

## Google Search Console

Search Console is optional and works in self-hosted deployments using your own
Google OAuth client. It takes ~10 minutes of one-time setup — see
[`docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).

## AI Features (SAM)

AI features like SAM, the in-app SEO agent, are optional — set the `OPENROUTER_API_KEY` environment variable to enable them (create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)).

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

To update to the newest published image, pull first and then restart:

```sh
docker compose pull
docker compose up -d
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

### Planning examples

- Track 100 keywords weekly at depth 50: `~$1.20/month`
- 100 keyword research requests at the default 150 results: `$3.50`
- 100 keyword research requests at 500 results each: `$7.00`
- 100 domain overviews (200 ranked keywords each): `$4.01`
- 100 backlinks domain searches at current defaults before opening extra tabs: about `$6.34`
- 100 backlinks page searches at current defaults before opening extra tabs: about `$4.30`
- 100 fully explored backlinks domain searches: about `$10.94`
- 100 fully explored backlinks page searches: about `$8.61`

### Pricing sources

- DataForSEO SERP API pricing: https://dataforseo.com/apis/serp-api/pricing
- DataForSEO Keywords Data API pricing: https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- DataForSEO Backlinks pricing: https://dataforseo.com/pricing/backlinks/backlinks
- DataForSEO Lighthouse API docs: https://docs.dataforseo.com/v3/on_page/lighthouse/overview/
