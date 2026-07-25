# Bing Webmaster Tools integration

## Status

Proposed (July 2026) — auth and identity verified against the live API by
`scripts/bing-oauth-spike.ts`; data endpoints not yet exercised.

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
  repeated reuse. This is ~10 minutes of observation and does not rule out the
  slower "original token expires after days" complaint in the same threads.
- **Stable account identity.** Bing has no userinfo endpoint and issues no
  `id_token`. **Resolved:** the access token is base64url-encoded JSON carrying
  `webmasteruid` (the account id, also surfaced as `AuthenticationCode` on
  every site) and `webmasteremail`.

## Decision

Add a Bing connection modelled on the GSC feature, plus read-only MCP tools.

**Auth (OAuth first, API key as fallback).** A Better Auth `genericOAuth`
provider `bing-webmaster` with explicit `authorizationUrl` and `tokenUrl` —
Bing publishes no OIDC discovery document — and a custom `getUserInfo` that
decodes the access token to `{ id: webmasteruid, email: webmasteremail }`
rather than making a network call. Scope `webmaster.read` for v1.

An API-key mode is also supported, and is not merely a convenience: Bing
rejects `localhost` redirect URIs and permits one redirect URI per registered
client, so a self-hoster cannot complete an OAuth flow locally. The key is
stored encrypted at rest with the same `symmetricEncrypt`/`BETTER_AUTH_SECRET`
approach used in `gsc/selfHostedOAuth.ts`, in a dedicated column — not in the
`account` table, whose refresh machinery does not apply to a non-expiring key.

**Scoping.** `bing_connections` maps one verified site to one project, unique
per project, mirroring `gsc_connections`: `projectId`, `organizationId`,
`siteUrl`, `connectedByUserId`, `bingAccountId` (the `webmasteruid`),
`connectedAccountEmail`, `authMode`. Mirrored across `src/db/` and
`src/db/pg/`, with migrations for both dialects.

**Surface.** Bing gets its own panel — site totals, top queries, top pages,
crawl issues — not a source toggle on the existing Search Performance page.
Bing cannot honour that page's date range, device or country controls, and
cannot paginate, so sharing the surface would mean either misrepresenting
Bing's capabilities or degrading the Google page.

**MCP tools** — read-only, free (no Autumn metering), project-scoped, matching
the GSC tools' contract: `get_bing_performance` and `get_bing_crawl_issues`.

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
  validation; dates are expected in `/Date(ms)/` form on the stats endpoints
  (unconfirmed — `GetUserSites` carries no date fields).
- Returned scope is `"Read"`, not the requested `webmaster.read`; scope strings
  must not be compared for equality.
- One redirect URI per OAuth client means one registered client per environment
  (local, preview, production).
- The refresh-token finding rests on a short observation window.
  `scripts/bing-oauth-spike.ts` is retained so it can be re-checked; if Bing
  ever starts rotating, `genericOAuth` becomes unsafe and the API-key mode
  becomes the primary path.
- `webmasteruid` doubles as the site verification code. It is an identifier,
  not a secret to be hashed, but it should not be rendered in the UI.
