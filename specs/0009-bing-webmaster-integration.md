# Bing Webmaster Tools integration

## Status

Proposed (July 2026) — auth, identity, and `GetRankAndTrafficStats` all
verified against the live API by `scripts/bing-oauth-spike.ts`.

## Context

OpenSEO reads first-party search data from Google via the Search Console
integration (`specs/0003`). Bing is the second source worth having: it is free,
it is the index behind ChatGPT search and Copilot, and it exposes crawl and
index diagnostics plus URL submission that Google does not offer at all.

Bing's API is not a second Search Console. Where GSC has one endpoint
(`searchAnalytics.query`) taking arbitrary date ranges, dimensions, filters and
paging, Bing has ~15 fixed-shape methods with **no date-range parameters and no
paging**: `GetRankAndTrafficStats` (daily site totals), `GetQueryStats` /
`GetPageStats` / `GetPageQueryStats` (top rows over a fixed ~6-month window),
`GetCrawlIssues`, `GetUrlInfo`, and the write-side `SubmitUrl` /
`SubmitUrlBatch`. It cannot filter by device or country, and it cannot answer a
custom date range.

Two auth questions blocked the design and were settled by a live spike:

- **Refresh-token rotation.** Public reports (Microsoft Q&A, unresolved as of
  January 2026) describe Bing rotating refresh tokens and then rejecting the
  rotated ones with `invalid_grant`. That would be fatal here: Better Auth
  overwrites the stored refresh token whenever a provider returns one
  (`dist/api/routes/account.mjs`), so a grant would die within one token
  lifetime. **Not reproduced.** Bing returns no `refresh_token` on refresh at
  all, so Better Auth's fallback preserves the original, which survived
  repeated reuse (replicated across two independent grants — see Consequences).
- **Stable account identity.** Bing has no userinfo endpoint and issues no
  `id_token`. **Resolved:** the access token is base64url-encoded JSON carrying
  `webmasteruid` (the account id, also surfaced as `AuthenticationCode` on
  every site) and `webmasteremail`. `webmasteruid` held its value across a
  fresh grant issued after the OAuth client secret was regenerated, so it
  identifies the Bing account rather than the grant or the client.

## Decision

Add a Bing connection modelled on the GSC feature, plus read-only MCP tools.

**Auth (OAuth; API key deferred).** A Better Auth `genericOAuth`
provider `bing-webmaster` with explicit `authorizationUrl` and `tokenUrl` —
Bing publishes no OIDC discovery document — and a custom `getUserInfo` that
decodes the access token to `{ id: webmasteruid, email: webmasteremail }`
rather than making a network call. Scope `webmaster.read` for v1.

Self-hosted deployments (`cloudflare_access`, `local_noauth`) cannot use
Better Auth's `oauth2.link`, which needs a Better Auth session they do not
have, so they get a hand-rolled authorize/callback pair mirroring
`gsc/selfHostedOAuth.ts` — HMAC-signed state, code exchange, and an `account`
row encrypted exactly as `setTokenUtil` would write it. Verified end to end on
a `cloudflare_access` deployment 2026-07-25. The redirect URI is
`{origin}/api/bing/oauth/callback`; Bing permits one per registered client, so
each environment needs its own.

An API-key mode is planned but **not implemented in this change**. Its
remaining use is local development: Bing rejects `localhost` redirect URIs
outright, so a dev server cannot complete an OAuth flow at all without a
public tunnel. When it lands the key will be stored encrypted at rest with the
same `symmetricEncrypt`/`BETTER_AUTH_SECRET` approach, in a dedicated column —
not in the `account` table, whose refresh machinery does not apply to a
non-expiring key. Today `bing_connections.auth_mode` is always written
`"oauth"`; the column exists so that lane needs no migration, and
`getPerformance` rejects any `"api_key"` row rather than silently building an
OAuth client for it.

**Scoping.** `bing_connections` maps one verified site to one project, unique
per project, mirroring `gsc_connections`: `projectId`, `organizationId`,
`siteUrl`, `connectedByUserId`, `bingAccountId` (the `webmasteruid`),
`connectedAccountEmail`, `authMode`. Mirrored across `src/db/` and
`src/db/pg/`, with migrations for both dialects.

**Surface.** Bing gets its own page — daily clicks and impressions in v1, with
top queries, top pages and crawl issues left for later — rather than a source
toggle on the existing Search Performance page.
Bing cannot honour that page's date range, device or country controls, and
cannot paginate, so sharing the surface would mean either misrepresenting
Bing's capabilities or degrading the Google page.

**MCP tools** — read-only, free (no Autumn metering), project-scoped, matching
the GSC tools' contract. v1 ships `get_bing_performance`; a crawl-issues tool
is deferred with the endpoint itself.

**Write operations deferred.** `SubmitUrl` / `SubmitUrlBatch` need
`webmaster.manage` and are a separate consent decision; they are not in v1.

## Rationale

Reads are free, so Bing follows GSC in bypassing credit metering and acting as
an activation hook. Mirroring the GSC layering (client → repository → service →
server function → MCP tool) means one reviewable shape rather than two, and the
GSC feature has already paid down the hard parts — grant failure vs. real
fault, per-project scoping, disconnect semantics.

Keeping Bing on its own surface is the load-bearing choice. The temptation is
to present "search performance" as one thing with a source switch; the APIs are
too different in shape for that to be honest, and the asymmetry is permanent
rather than something Bing will grow out of.

## Consequences

- Bing data cannot be filtered or date-ranged the way GSC data can. Comparisons
  between the two are directional, not like-for-like.
- Every response is wrapped in a WCF `d` envelope and must be unwrapped before
  validation. Dates arrive as `/Date(ms±HHMM)/` — the offset is informational,
  the milliseconds are already UTC. Confirmed on `GetRankAndTrafficStats`
  2026-07-25; `GetUserSites` carries no date fields.
- `GetRankAndTrafficStats` returns one row per day carrying exactly `Date`,
  `Clicks`, and `Impressions` (plus the `__type` marker). Verified live
  2026-07-25, so rows are typed rather than passed through; unknown extra
  fields are tolerated and ignored. The window is Bing's choice and varies by
  site — 34 rows for one site and 165 for another on the same day.
- Its `Date` is a day BUCKET at midnight in Bing's reporting timezone (US
  Pacific; the offset moves with daylight saving), not an instant. Render it in
  UTC — formatting in the viewer's timezone labels every row a day early west
  of UTC-8.
- `GetQueryStats` and `GetPageStats` (verified live 2026-07-25, not yet used)
  share one row shape: `Query`, `Clicks`, `Impressions`, `Date`,
  `AvgClickPosition`, `AvgImpressionPosition`. `GetPageStats` reuses the
  `QueryStats` type and puts the page URL in `Query`. `AvgClickPosition` is
  `-1` when nothing was clicked. So average position and a striking-distance
  view ARE reachable — but these rows are SAMPLED, roughly 16 distinct dates
  across five months, so query-level trends are lumpy and a "last 28 days"
  slice can come back empty. Site-level daily totals remain the only dense
  series.
- `GetPageQueryStats` (verified live 2026-07-25): takes `siteUrl` plus a
  `page` query parameter (that exact name — the docs disagree with
  themselves) and returns the same `QueryStats` row shape, filtered to
  queries for that one page. The filter is real: 902 rows for one page, 100
  for another, 0 for a nonexistent URL. Same sampling caveats as
  `GetQueryStats`.
- Crawl and link methods (probed live 2026-07-25, none used yet):
  - `GetCrawlStats(siteUrl)` — one row per day, ~169 rows, a DENSE daily
    series unlike the sampled query data: `Date` (WCF), `CrawledPages`,
    `InIndex`, `InLinks`, `CrawlErrors`, `Code2xx`/`Code301`/`Code302`/
    `Code4xx`/`Code5xx`/`AllOtherCodes`, `BlockedByRobotsTxt`,
    `ConnectionTimeout`, `DnsFailures`, `ContainsMalware`.
  - `GetCrawlIssues(siteUrl)` is a DEAD END too (concluded 2026-07-27):
    it returned 200 with 0 rows for a site whose own `GetCrawlStats` shows
    errors on essentially every day of the window (27 crawl errors, 14 4xx,
    1 5xx, 178 robots-blocked over 37 days) and whose portal shows crawl
    issues. Probed across https/http/www/trailing-slash variants. The
    portal's crawl-issues detail lives in the private 2020-portal API, like
    Backlinks. The legacy API's only usable crawl-error signal is the
    aggregate daily counts in `GetCrawlStats`.
  - `GetLinkCounts(siteUrl)` and `GetUrlLinks(siteUrl, link)` are DEAD
    ENDS: both return 200 with empty payloads (`{ Links: [], TotalPages: 0 }`
    / `{ Details: [], TotalPages: 0 }`, with or without the integer `page`
    pager) for a site whose portal Backlinks tool shows 27 referring
    domains and 85 referring pages. The 2020 portal's Backlinks data is not
    served by the legacy JSON API, and Microsoft Q&A carries the same
    unresolved report from other users. Do not build on these; Bing
    backlink data would need the portal's private API, which we will not
    touch. (`GetUrlLinks` param name is `link`; `url` → 400 InvalidUrl,
    `page` → 400 format error.)
- Returned scope is `"Read"`, not the requested `webmaster.read`; scope strings
  must not be compared for equality.
- One redirect URI per OAuth client means one registered client per
  environment, and `localhost` is refused outright — local development needs a
  public tunnel or the deferred API-key mode.
- The refresh-token finding was replicated on 2026-07-25 across two
  independent grants, before and after regenerating the OAuth client secret:
  Bing returned no `refresh_token` on refresh in either, and the original
  survived repeated reuse. What remains untested is the multi-day complaint in
  the public reports — that an original token eventually expires
  unpredictably. `scripts/bing-oauth-spike.ts` is retained so this can be
  re-checked; if Bing ever starts rotating, `genericOAuth` becomes unsafe and
  API-key mode becomes the primary path.
- `webmasteruid` doubles as the site verification code. It is an identifier,
  not a secret to be hashed, but it should not be rendered in the UI.

## Future directions

The v2 surface originally sketched here is BUILT (July 2026, fork PRs
#3–#6/#10): striking distance (positions 5–20 by impressions, with
copy/save-as-keywords and export), Queries and Pages tables with CTR and
impression-weighted average-position tiles, the page → queries drill-down
(`GetPageQueryStats`), the Crawl tab (`GetCrawlStats` — including
robots-blocked and other-codes series), and the `get_bing_queries` MCP tool
(dimension, strikingDistanceOnly, pageUrl, limit). Tile period comparisons
half-split the dense daily series after trimming leading all-zero days, and
suppress the delta when the prior half carries under 1% of current
impressions (PR #4).

Still genuinely future:

- **API-key connection mode** — `bing_connections.auth_mode = "api_key"` is
  reserved but unimplemented. It is the local-dev/self-hosted lane (Bing
  rejects localhost redirect URIs) and becomes the PRIMARY path if the
  refresh-token re-check ever shows Bing rotating tokens.
- **URL submission** — `SubmitUrl`/`SubmitUrlBatch` need `webmaster.manage`
  and re-consent on every grant. IndexNow (key file, no OAuth, also covers
  Yandex/Seznam/Naver) is the better-shaped alternative if submission is
  ever wanted.
- A crawl-issues DETAIL view is NOT reachable — `GetCrawlIssues` is a dead
  end (see Consequences), as are the link-detail endpoints. The aggregate
  daily counts on the Crawl tab are the ceiling.

What still cannot be built, and should not be faked: device and country
filters (Bing exposes no such dimension) and a date-range control. Query and
page rows are SAMPLED at roughly 16 dates across five months, so a "last 28
days" slice can come back nearly empty — a date picker there would promise
precision the data does not have. Only site-level daily totals are dense.

Probe any further endpoint with `scripts/bing-oauth-spike.ts --step=call
--method=<Method> --site=<url>` before coding against it. Every shape recorded
here was pinned that way, and Microsoft's documentation has been wrong more
than once on this integration.
