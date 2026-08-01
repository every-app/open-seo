---
title: "Self-Hosting OpenSEO"
description: "Run OpenSEO yourself with Docker or Cloudflare, bring your own DataForSEO API key, and pay only for what you use."
---

OpenSEO is free and open source. Self-hosting means the app costs $0. You bring your own DataForSEO API key and pay DataForSEO directly for API usage.

There are two self-hosting paths:

- **Simple: [Docker](/docs/self-hosting/docker)**, recommended for personal use on your own machine. Easiest way to get started.
- **Advanced: [Cloudflare](/docs/self-hosting/cloudflare)**, for internet-facing self-hosting across multiple devices or with your team. A SaaS-like experience with automatic database backups, and it works on Cloudflare's free plan. Slightly more setup if you're unfamiliar with Cloudflare.

## DataForSEO API key setup

OpenSEO uses [DataForSEO](https://dataforseo.com/?aff=255379) to fetch SEO data. DataForSEO is a paid third-party service unaffiliated with OpenSEO. You need an API key to connect OpenSEO to it.

1. Go to [DataForSEO API Access](https://app.dataforseo.com/api-access?aff=255379).
2. Click "Send by email" to get your credentials.
3. Copy the longer credentials labelled "Base64" credentials.
4. Set this as `DATAFORSEO_API_KEY` in your environment:
   - Docker: `.env`
   - Cloudflare: as a Worker secret in the dashboard
   - Local development: `.env.local`

New DataForSEO accounts include $1 of free credit to test with, and the minimum top-up is $50. See [pricing](/pricing) for cost estimates. Self-hosted costs run slightly lower, since the hosted service adds a 28% fee on DataForSEO requests.

## Optional features

### Google Search Console

Search Console is optional and works in self-hosted deployments using your own Google OAuth client. It takes about 10 minutes of one-time setup. See the [Google Search Console guide on GitHub](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).

### AI features (SAM)

AI features like SAM, the in-app SEO agent, are optional. Set the `OPENROUTER_API_KEY` environment variable to enable them. Create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
