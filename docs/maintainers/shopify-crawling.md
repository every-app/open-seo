# Shopify storefronts and the site audit crawler

What Shopify does to crawlers, what our production data and experiments showed
on 2026-10-23, what the crawler does about it, and what is left to try.

## What Shopify does

- Since 2026-05-30 Shopify applies tiered rate limits to bots on storefront
  pages and the Storefront API: unsigned traffic gets the strictest tier,
  traffic signed with Web Bot Auth a higher tier, and a third tier is granted
  by application through a Google Form linked from the
  [changelog](https://shopify.dev/changelog/posts/bots-and-agents-should-identify-themselves-via-web-bot-auth).
  Shopify staff have said a third-party signature alone changes nothing until
  the bot is registered through that form. No tier has published numbers.
- Merchants can mint a crawler signature in admin (Online Store → Preferences →
  Crawler access): three static headers, one connected domain each, at most
  three months, not renewable. The help page says a signed crawler that still
  gets 429s has an invalid signature. Our data says otherwise (below).
- The refusal is `HTTP 429`, body `local_rate_limited`, `Retry-After: 60`,
  answered by Shopify's ingress tier behind Cloudflare (one `x-dc` hop, no
  `cf-mitigated`), not by Cloudflare's edge. Pages served from Cloudflare's
  cache (`cf-cache-status: HIT`) are never refused; cold listing pages (blogs,
  deep pagination, collections) are refused most.
- Whether a request is refused depends on the client identity (IP class, TLS
  fingerprint, user agent), the path, and the cache state together. Nothing
  about it is documented, and Shopify offers no IP allowlisting.

## What our data showed

Sixty days to 2026-10-23, hosted production:

| Measure                                              | Value          |
| ---------------------------------------------------- | -------------- |
| Shopify audits (projects)                            | 1,827 (1,033)  |
| Stopped early on a rate limit                        | 558 (31%)      |
| Stopped at first contact (homepage refused)          | 302            |
| Stopped mid-crawl                                    | 256            |
| Mid-crawl stops caused by exactly one refused URL    | 242            |
| Refused pages per 1,000 fetched, unsigned vs signed  | 5.0 vs 2.5     |
| Image and asset links fetched as pages, worst audit  | 1,986 of 2,608 |
| Stores refused at first contact, audited again later | 166            |
| of which served on another run                       | 151 (91%)      |
| Stores with a stopped audit, audited again later     | 219            |
| of which had a clean run of more than ten pages      | 177 (81%)      |

First-contact refusals did not correlate with how many other Shopify audits we
had running, so they are not self-inflicted by our own pacing.

A refusal is not a verdict on the store or on our identity: the same store,
crawled from the same Worker identity, is usually served on a later run, and
28 of the 146 first-contact refusals with a later clean run had it within ten
minutes. What the old crawler never measured is whether the next URL in the
same run is served after a refusal, because it stopped at the first refused
URL. The new logs measure exactly that.

## What the experiments showed

- From the production Worker, Shopify sees every request as coming from
  `2a06:98c0:3600::103`, the single address Cloudflare uses for Worker
  subrequests to other Cloudflare-proxied zones (`/cdn-cgi/trace` on any
  storefront shows it). Shopify storefronts are Cloudflare BYOIP. Every Worker
  of every Cloudflare customer shares that identity at Shopify, and no
  Cloudflare product changes it.
- A throwaway Worker fetched 60 storefront homepages in 15 seconds with no
  refusal, while a residential machine was refused on 12 of 23 homepages a
  minute later and on 20 of 30 product pages at one request per second after
  about 35 earlier requests. Cloudflare's Worker identity is treated more
  generously than a residential IP, and public reports say datacenter IPs on
  AWS, GCP and OCI are refused on their first request. Moving the crawler to a
  static cloud IP would make Shopify coverage worse, not better.
- The refusals that ended audits were per URL: around them, thousands of pages
  were served at one request per second, signed or unsigned. The crawler's old
  rule, retry the same URL three times with the whole crawl paused and stop
  after four refusals in a row, turned one refused listing page into a stopped
  audit.
- Sending our own Web Bot Auth headers to Shopify is neutral; bogus signature
  headers did not change outcomes either.

## What the crawler does now

The pacing and refusal rules live in `src/server/lib/audit/crawl-throttle.ts`
and its header comment; the public summary is in `web/content/docs/crawler.md`.
The Shopify-specific parts:

- Links to images, fonts, scripts and other files are not fetched as pages,
  and on Shopify neither are the customer-authentication, discount and
  password routes, which its edge refuses and its robots.txt does not cover.
- A refused `robots.txt` or sitemap is retried once after its `Retry-After`,
  within a two-minute budget per discovery run.
- Every 429 logs `site_audit:rate_limited` with the URL, Retry-After, response
  time, `cf-cache-status`, whether a merchant signature was sent, and the
  body's first characters.

## Ruled out

- Static or dedicated egress IPs on Cloudflare: none exist for Workers on any
  plan. Aegis (Dedicated CDN Egress IPs) covers Cloudflare-to-your-origin
  traffic only. Cloudflare One dedicated egress IPs are an Enterprise add-on
  and undocumented for Workers VPC. Workers VPC with a Mesh or Tunnel exit node
  is undocumented for Worker fetches to public hosts.
- A self-run fetcher on AWS, Fly or Hetzner: cheap (about $5 to $10 a month)
  but a datacenter IP is the identity Shopify refuses hardest.
- Browser Rendering: Cloudflare always marks it as bot traffic.
- Cloudflare Verified Bot status: Shopify says enrolling with Cloudflare is not
  part of its process.

## Plan

1. Watch the new `site_audit:rate_limited` logs and the share of Shopify
   audits that still stop early. The cache-status field tells whether cold
   pages are what gets refused.
2. Register OpenSEO-Audit with Shopify through the Web Bot Auth registration
   form: Signature-Agent `"https://app.openseo.so"`, the key directory at
   `/.well-known/http-message-signatures-directory`, user agent
   `OpenSEO-Audit/1.0`, category Search Engine Optimization, the crawl rate
   (one request per second, two in flight), and the public crawler page as
   documentation. There is no review timeline, and no report yet of approval
   lifting refusals for a Workers-based crawler, so treat it as a bet.
3. Run a controlled test on a store we control or with a merchant's help:
   the same refused URL with the merchant's signature from the Worker and from
   a residential machine, logging status, `x-dc` and `cf-cache-status`. This is
   the only way to learn whether a signature exempts the refused listing pages.
4. Try Context.dev for refused pages in unrendered audits. It fetches from
   outside Cloudflare, costs about 3.8 usage credits a page, and already exists
   as the rendering fallback. Two credits answer whether it gets a refused URL
   through; a capped fallback for the handful of refused pages would follow.
   For Shopify, Context should go before Browser Run, which never passes.
5. Crawl sitemap URLs before link-only URLs and strip tracking parameters
   (issue #274), so capped audits cover what the store declares first.

## Open questions

- After a refusal, is the next URL in the same run served (a per-URL
  refusal), or does the store refuse everything for a few minutes? The crawler
  tolerates about six minutes of continuous refusals before it stops.
- Does Shopify's registration lift refusals for the shared Workers identity?
- Does a valid merchant signature exempt the refused listing pages at all?
- Does Context.dev's egress get those pages through, and from what network?
