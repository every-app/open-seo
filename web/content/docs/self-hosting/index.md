---
title: "Self-Hosting OpenSEO"
description: "Run OpenSEO yourself with Docker or Cloudflare, bring your own DataForSEO API key, and pay only for what you use."
---

OpenSEO is free and open source. Self-hosting means the app costs $0. You bring your own DataForSEO API key and pay DataForSEO directly for API usage.

There are two self-hosting paths. Both use email and password accounts: the first visitor creates the admin account and teammates join from invitation links.

- **[Docker](/docs/self-hosting/docker)**, on your own server or computer. A prebuilt image that is ready in seconds, and works with Compose-based platforms such as Coolify, Portainer and Dokploy.
- **[Cloudflare](/docs/self-hosting/cloudflare)**, with no server to run. One deploy command puts OpenSEO on your own Cloudflare account, with automatic database backups, and it works on Cloudflare's free plan.

OpenSEO also runs on [EveryApp](https://everyapp.com/docs/apps/openseo), which installs it on your own Cloudflare account with sign-in, team access and your DataForSEO key handled for you.

For security-conscious setups, you can replace the accounts with your own network controls: Cloudflare Access in front of the Cloudflare deploy, or Docker without sign-in behind Tailscale or a private network.

## DataForSEO API key setup

OpenSEO uses [DataForSEO](https://dataforseo.com/?aff=255379) to fetch SEO data. DataForSEO is a paid third-party service unaffiliated with OpenSEO. You need an API key to connect OpenSEO to it.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access?aff=255379).
2. Click "Send by email" to get your credentials.
3. Copy the longer credentials labelled "Base64" credentials.
4. Set this as `DATAFORSEO_API_KEY` in your environment:
   - Docker: `deploy/standalone/.env`
   - Cloudflare: `.env.selfhost`
   - Local development: `.env.local`

New DataForSEO accounts include $1 of free credit to test with, and the minimum top-up is $50. See [pricing](/pricing) for cost estimates. Self-hosted costs run slightly lower, since the hosted service adds a 28% fee on DataForSEO requests.

## Optional features

### Google Search Console

Search Console is optional and works in self-hosted deployments using your own Google OAuth client. It takes about 10 minutes of one-time setup. See the [Google Search Console guide on GitHub](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).
