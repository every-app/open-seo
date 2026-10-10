# Bing Webmaster Tools integration

## Status

Accepted

## Context

OpenSEO reads a project's first-party search data from Google Search Console and its post-click behaviour from Google Analytics. Bing is a second search engine with its own index and meaningful share, and users asked for the same first-party visibility there. Bing Webmaster Tools does not bill for its data, so it should not consume credits the way DataForSEO does.

## Decision

Add a native Bing Webmaster connection plus three read-only MCP tools.

**Auth (API keys, plus delegated OAuth).** Bing issues one API key per Bing account, generated in Bing Webmaster Tools under Settings → API Access, and it covers every site the user has verified there. OpenSEO stores each key per OpenSEO user (one row per Bing account), encrypted at rest with the same secret that protects the Google grants and crawler credentials. A key is never returned to a client, logged, or recorded in telemetry; only its last four characters are shown. Alongside keys, a member can connect one delegated OAuth account: Bing's OAuth client is registered in the same API Access page (one exact-match redirect URI per client, so one client per environment), the grant requests the read-only `webmaster.read` scope, and its tokens live in the `account` table under the `bing-webmaster` provider ID like the Google grants. Bing's token response carries no account identity, so there is exactly one OAuth grant per OpenSEO user; pasted keys remain unlimited. A connection (`bing_connections`, unique per project, `credential_id` nullable) points at either a key row or — when null — the connector's OAuth grant.

**Protocol.** Bing retired its SOAP and POX/HTTP APIs on 2026-08-31; only JSON/HTTP remains, at `https://ssl.bing.com/webmaster/api.svc/json/`. Every call carries the key as a query parameter.

**Scoping.** A connection maps one verified Bing site to one project (`bing_connections`, unique per project). The mapping belongs to the project/workspace; any member can read through it, and requests run under the connecting member's key. The key itself belongs to the member who saved it (`bing_credentials`), so a second project reuses the same key rather than re-entering it. Site selection lives in the Integrations UI, not an MCP tool.

**MCP tools** — read-only, free (no Autumn metering), scoped to a project the caller's workspace owns:

- `get_bing_search_performance`: clicks, impressions, CTR, and average impression position grouped by query, page, or date. Bing returns one row per key per day over a fixed window with no date-range parameter, so rows are summed across the period Bing reports. Every response carries a `coverage` object (the covered `startDate`/`endDate`, the distinct day count, and `timeZone: "UTC"`) and a whole-window `total` independent of grouping, so a caller can show accumulated and segregated views from one call. Position is Bing’s impression-weighted average position (AvgImpressionPosition); CTR is derived from clicks and impressions, because Bing returns no CTR field. `groupBy: "date"` yields a daily series that can be aligned against another source.
- `inspect_bing_urls`: `GetUrlInfo` for 1–10 URLs with per-URL partial results — HTTP status, last-crawled and discovery dates, whether Bing treats it as a page, document size, inbound-link count, and child-URL count. Bing exposes no indexing-status, robots-directive, or content-changed property. Bing reports HTTP status 0 when it has none, which is surfaced as "not reported" rather than passed through as a code.
- `get_bing_crawl_stats`: `GetCrawlStats` per-day crawl and index counts (pages crawled, pages in Bing's index, crawl errors, response-code buckets, robots-blocked, DNS failures, connection timeouts, malware flags, inbound links) plus `GetCrawlIssues` — the URLs Bing flags, each with its HTTP code, inbound-link count, and an undocumented issues bitmask that is passed through rather than decoded. Bing has no crawl or index API on the Google side, so this view is Bing-only.

**Time and cross-source alignment.** Bing dates are UTC and cover a fixed window; Search Console dates are `America/Los_Angeles` and accept a caller-chosen range (up to 16 months, ~3-day lag); Analytics uses the property's time zone. The sources are therefore not interchangeable: their windows differ and their definitions of a click differ. OpenSEO never sums one engine's figures into another's and never treats a day a source did not cover as zero. Each response states its own coverage, and a caller aligns the two by intersecting the reported windows and reading each source within that overlap. Long-horizon or point-in-time comparisons across sources are left to the caller's grouping over the returned series, not to a stored, merged time series.

**Disconnect** removes the project's site mapping and unlinks the API key only when its owner has no other connected project — never as a side effect of a different member disconnecting. A delegated OAuth grant is never unlinked by disconnecting; removing it is an explicit account action that also deletes its OAuth-backed mappings.

## Rationale

Treating Bing reads as free matches Search Console: Bing does not bill for them. A per-user key plus a per-project mapping matches how Bing issues keys (one per account) and how teams work (a different site per project), while keeping queries scoped to a workspace the caller owns. Storing the key encrypted with the existing secret keeps self-hosted setup to the secret operators already set for Search Console, with no new credential or callback URL.

## Consequences

- Connecting takes either a pasted API key (no setup) or one delegated OAuth account per user via an in-app consent screen; the OAuth path needs a per-environment Bing client (`BING_CLIENT_ID`/`BING_CLIENT_SECRET`) whose redirect URI is `<origin>/api/bing/oauth/callback`.
- One site per project (re-selecting replaces it); no history or caching — every query hits Bing live.
- Bing's window is fixed and its rows are aggregated by OpenSEO; `groupBy: "date"` and the `coverage` object let a caller rebuild a daily series and align it against another source, but Bing itself cannot be asked for an arbitrary date range.
- New Bing capabilities should extend `BingService` and the MCP tools, keeping reads free and project-scoped.
