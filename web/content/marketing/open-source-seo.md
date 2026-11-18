---
title: Open source alternative to Semrush and Ahrefs
description: OpenSEO is an MIT-licensed SEO platform. Self-host it with Docker or Cloudflare, or use it hosted from $10 a month. You pay for search data by usage.
---

OpenSEO does keyword research, rank tracking, backlink checks, site audits, competitor research and AI visibility tracking. It has an [MCP server](/features/mcp), so an AI agent like Claude or ChatGPT can work with the same data. The code is [on GitHub](https://github.com/every-app/open-seo) under the MIT license.

## What costs money

OpenSEO's software costs nothing. You pay for search data, such as search volumes, rankings and backlinks, which come from [DataForSEO](https://dataforseo.com/) and are charged per lookup. You either pay DataForSEO yourself or pay us to do it for you.

|                                   | Self-hosted                                                                                  | Hosted at app.openseo.so                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Software                          | $0                                                                                           | From $10 a month, with $10 of usage included |
| Search data                       | DataForSEO's prices, paid to them. New accounts get $1 of credit. The minimum top-up is $50. | DataForSEO's price plus 28%                  |
| Hosting                           | Your own server or Cloudflare account                                                        | Included                                     |
| Search Console and Analytics data | Free, with your own Google OAuth client                                                      | Free, sign in with Google                    |
| Trying it first                   | The $1 of DataForSEO credit                                                                  | $0.50 of credits, no card needed             |

What the data costs on the hosted app:

- A keyword research search is about 5¢.
- A backlink overview of a domain is about 8¢.
- Tracking 100 keywords every week on one device is $3 to $6 a month.
- A standard site audit and your Search Console data use no credits.

Self-hosted, the same lookups cost about a fifth less, because you skip the 28% fee. [Estimate your own month](/pricing).

## How to self-host

There are two ways to run OpenSEO yourself:

- [Docker](/docs/self-hosting/docker), on your own server or computer. The image is prebuilt and starts with Docker Compose.
- [Cloudflare](/docs/self-hosting/cloudflare), with no server to run. One command deploys it to your own Cloudflare account, and it works on Cloudflare's free plan with smaller site audits.

Both need a DataForSEO API key. The [self-hosting guide](/docs/self-hosting) covers the rest.

## FAQ

### Is there an open source alternative to Semrush or Ahrefs?

Yes. OpenSEO is MIT-licensed and covers the work most people use those tools for: keyword research, rank tracking, backlinks, site audits and competitor research. Semrush and Ahrefs run their own crawlers and have bigger keyword and backlink databases. OpenSEO buys its data from DataForSEO and charges by usage. See the full comparisons with [Semrush](/semrush-alternative) and [Ahrefs](/ahrefs-alternative), or our list of [other open source SEO tools](/blogs/best-open-source-seo-tools).

### Is there an SEO tool I can self-host?

Yes. OpenSEO runs on your own server with [Docker](/docs/self-hosting/docker), or on your own [Cloudflare](/docs/self-hosting/cloudflare) account. The first person to open it creates the admin account, and teammates join from invitation links. You bring a DataForSEO API key for the search data.

### Is there an open source keyword research tool?

Yes. OpenSEO's [keyword research](/features/keyword-research) returns up to 500 ideas per search with volume, difficulty, CPC and search intent. It covers 211 countries. 94 of them have every metric, and the rest have volume and CPC only. A search costs about 5¢ on the hosted app. To try it without an account, the [free keyword generator](/keyword-generator) returns up to 20 ideas.

### Are open source SEO tools free?

Open source SEO software costs nothing to use. Tools that only crawl your own site, like site auditors, also cost nothing to run. Tools that show search volumes, rankings or backlinks need a paid data source, and that is true of OpenSEO too:

- Self-hosted OpenSEO costs $0 for the software. DataForSEO gives new accounts $1 of credit, and its minimum top-up is $50.
- Hosted OpenSEO starts at $10 a month with $10 of usage included. New accounts get $0.50 of credits to try it, with no card.

## Why OpenSEO is open source

Open source puts the power in the hands of the users. Anyone can self-host OpenSEO and use it at cost, and another company could offer the same service for less. That is a check on us: we cannot keep raising prices, so the hosted app has to stay worth paying for.

It also means you can build on it. If you are thinking of building your own SEO tool with an AI coding agent, start from OpenSEO's keyword research, backlinks and rank tracking instead of rebuilding them.

Open source is our mission. Read why we care about it in [The Future of SEO Software Is Open Source](/blogs/why-openseo-is-open-source).
