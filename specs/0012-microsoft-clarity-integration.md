# Microsoft Clarity integration

## Status

Implemented locally for maintainer review. This document describes the bounded
v1 contract; it does not claim the feature is merged or deployed.

## Context

Search Console explains how a site appears in Google and GA4 explains traffic
and outcomes. Microsoft Clarity adds aggregate behavior signals such as scroll
depth, engagement time, popular pages, dead clicks, rage clicks, quick backs,
script errors, and error clicks.

Clarity's documented Data Export API does not expose a third-party OAuth flow.
A Clarity project admin generates a project-scoped JWT token under **Settings →
Data Export**. OpenSEO therefore presents a native connection card with a
masked token input instead of pretending that the flow is OAuth.

## Decision

Add a native, optional, read-only Microsoft Clarity integration for each
OpenSEO project. The feature is available to hosted and self-hosted deployments
and reuses the deployment's stable `BETTER_AUTH_SECRET` (at least 32 characters)
for credential encryption; there is no Clarity-specific environment variable.

### Connection lifecycle and secret handling

- Only a user with the existing `integration:manage` permission can connect,
  replace, or disconnect Clarity.
- The browser submits the token once to a server function over the existing
  authenticated application session.
- The service validates the token with a fixed three-day overview request
  before writing anything. Invalid credentials fail closed.
- The deployment's stable Better Auth secret encrypts the token at rest.
  Neither server functions nor MCP responses return it.
- The connection table stores only the ciphertext, a last-four-character
  display hint, project and organization ownership, connector user ID, and
  timestamps.
- Replacing a token atomically removes every cached Clarity report before
  storing the newly validated overview. This prevents data from an old Clarity
  project being shown under a replacement credential.
- Disconnecting removes both the connection and its report cache. Revoking the
  upstream token itself remains a Clarity administrator action.

### Storage

SQLite and Postgres define structurally equivalent tables:

- `clarity_connections`, unique by `project_id`, with an organization foreign
  key and encrypted token material.
- `clarity_report_cache`, unique by `(project_id, report_kind, num_of_days)`,
  containing the privacy-sanitized provider response and its UTC fetch time.
- `clarity_report_refresh_leases`, unique by the same report identity, providing
  a persistent cross-isolate refresh lease and bounded provider-failure
  cooldown.

Cache and lease rows reference the current connection generation and cascade
when that connection is replaced or removed. All three tables cascade on
project deletion. The connection's organization ID is repointed by the existing
legacy-workspace merge before old organizations are deleted.

The Clarity response is stored as opaque JSON only as an external-response
cache. Product-owned relational data is not encoded into this field. Cache JSON
is bounded below D1's per-value limit; when storage truncation is necessary,
the response retains original row counts and emits an explicit warning.

### Quota policy

Microsoft documents a maximum of ten Data Export requests per Clarity project
per day, a one-to-three-day lookback, at most three dimensions, and no
pagination beyond the returned 1,000 rows.

OpenSEO uses a persistent 24-hour cache shared by the app, external MCP clients,
and the in-app agent. V1 exposes only two fixed report shapes and three allowed
lookbacks, so ordinary sequential use can consume at most six provider reads
per OpenSEO project per cache cycle. Connecting consumes one read and primes
the default three-day overview cache. Because the ten-call allowance belongs
to the upstream Clarity project (not to its individual tokens), operators should
connect one Clarity project to only one OpenSEO project.

Local single-flight and persistent database leases coalesce concurrent refreshes
without assuming one Worker isolate. Rate-limit and authentication failures are
shared across report shapes so retries cannot spend quota repeatedly. A 429
uses a minimum 24-hour cooldown; storage-write failures after a provider call
use a one-hour cooldown.

When a stale cache exists, transient network, 5xx, malformed-response, or quota
failures return that cache with an explicit `stale_cache_served` warning. A
401/403 never falls back to stale data: it returns
`clarity_reconnect_required`.

### MCP tools

Both tools require a project ID and pass the normal MCP project authorization
gate before any provider call. They use no OpenSEO credits.

- `get_microsoft_clarity_overview` requests no dimension and returns the
  available aggregate metric groups.
- `get_microsoft_clarity_url_insights` fixes `dimension1=URL` and returns the
  same metric groups broken down by URL.

Inputs are limited to `numOfDays` (`1 | 2 | 3`, default `3`) and
`limitPerMetric` (`1..50`, default `10`). Callers cannot provide a token,
arbitrary dimensions, a URL, or raw provider query parameters.

The cache keeps the bounded validated provider response. MCP output applies
per-metric and global row limits, bounds strings, and reports total, returned,
and truncated counts. Text output previews at most forty rows while
`structuredContent` contains the globally bounded raw and normalized rows.

Success responses include:

```text
{
  status: "ok",
  source: { provider: "microsoft_clarity", api: "data_export", timeZone: "UTC" },
  request: { reportKind, numOfDays, dimensions },
  metrics,
  normalized,
  coverage,
  cache: { hit, stale, fetchedAt, ttlHours: 24 },
  truncation,
  warnings
}
```

Expected error codes are `clarity_not_connected`,
`clarity_reconnect_required`, `clarity_rate_limited`,
`clarity_upstream_unavailable`, and `clarity_malformed_response`. Connection
errors map to the app's safe standard error codes without provider bodies or
credential details.

### Privacy boundary

This integration requests aggregate Data Export metrics only. V1 does not fetch
session recordings, heatmaps, DOM snapshots, free-form user input, or request
user-level identifiers. Site-controlled page paths, titles, and referrers can
still contain sensitive content: OpenSEO strips query strings and fragments
from URL-shaped values before persistence or return. Distinct URLs that become
identical after redaction retain response-local opaque join keys, so metric
groups cannot overwrite or mix variants; the UI labels those indistinguishable
variants explicitly. The keys are sequential and carry no hash or reversible
derivative of the original URL. The site owner remains responsible for Clarity
consent, masking, and avoiding sensitive data in paths or titles. Connecting
OpenSEO does not install or alter the tracking script.

Cached reports are never served after seven days and the scheduled maintenance
job removes expired cache and refresh-lease rows in bounded batches.

### Product surface

The project integrations page contains the token connection lifecycle. A
dedicated **Clarity Insights** route exposes 24-, 48-, and 72-hour summaries,
traffic and engagement KPIs, behavioral-friction metrics, paginated URL
insights, and dimension breakdowns. Sensitive report surfaces are masked from
the existing product-session replay integration.

## Verification

The implementation includes tests for:

- SQLite/Postgres schema parity and workspace migration behavior;
- bearer-header construction, response validation, and provider error mapping;
- encryption round-trip with no plaintext persistence;
- validate-before-write connection behavior;
- fresh and stale cache paths, refresh joining/cooldowns, 401 reconnect
  behavior, connection-generation races, retention, and project scoping;
- normalization, privacy sanitization, storage-size and provider-row bounds;
- Clarity insights assembly and server-side pagination without raw-data leakage;
- MCP output bounds, schema validation, reconnect links, and authorization
  before provider access.
