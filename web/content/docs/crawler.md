---
title: "OpenSEO-Audit crawler"
description: "What the OpenSEO site audit crawler does, how it identifies itself, and how to allow or block it."
---

OpenSEO-Audit is the crawler behind OpenSEO's site audits. It only visits a site when an OpenSEO user starts an audit of that site. It reads pages to check for SEO issues like broken links, missing titles, and redirect chains. It does not index content or collect training data for AI.

## How it identifies itself

Every request sends this user agent:

```
OpenSEO-Audit/1.0
```

Requests from OpenSEO's hosted app are also signed with [Web Bot Auth](https://developers.cloudflare.com/bots/reference/bot-verification/web-bot-auth/), an HTTP message signature standard. A user agent can be faked, but a signature can't. The public key is published at:

```
https://app.openseo.so/.well-known/http-message-signatures-directory
```

The crawler runs on Cloudflare Workers, so it has no fixed IP addresses. Use the signature to verify it instead of an IP list.

## robots.txt

An audit starts with one `HEAD` request to the start URL, following redirects, to find the site's real address. The crawler then reads `robots.txt` and skips any page it disallows. Rules for `OpenSEO-Audit` take priority over rules for `*`. To keep it out of your whole site:

```
User-agent: OpenSEO-Audit
Disallow: /
```

## Crawl rate

The crawler sends about one request per second to a site, and an audit fetches a limited number of pages, set by the user who starts it. When a site answers with `429 Too Many Requests`, the crawler pauses for the `Retry-After` header, slows down, and tries that page once more. A page refused again is reported as rate limited and the crawl moves on. If the site refuses several pages in a row, or keeps the crawler waiting for hours in total, the audit stops early. The crawler does not fetch links to images, scripts, fonts and other files.

## Allowing the crawler through a firewall

If your firewall or bot protection blocks OpenSEO-Audit, allow requests whose user agent contains `OpenSEO-Audit`. On Cloudflare, create a WAF custom rule that skips bot protection for that user agent.

Self-hosted copies of OpenSEO send the same user agent but do not sign their requests.

Two optional audit features load pages another way, without the `OpenSEO-Audit` user agent or a signature:

- "Render JavaScript" loads pages in a headless browser, usually [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/).
- Lighthouse checks run from [DataForSEO](https://dataforseo.com/)'s servers with Lighthouse's own Chrome user agent.
