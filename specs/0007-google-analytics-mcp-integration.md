# Google Analytics MCP integration

## Status

Proposed

## Context

OpenSEO can read a project's Google Search Console (GSC) property, but an agent
cannot see what visitors do after the click. GA4 adds the missing first-party
signals: organic sessions, engagement, key events, transactions, and revenue.
The first release should answer SEO questions rather than expose an unrestricted
analytics report builder.

GA4 and GSC remain separate sources. They use different attribution rules,
reporting time zones, and definitions, so their counts must not be presented as
if they are interchangeable. The useful join is page-level correlation: search
demand and visibility from GSC alongside engagement and business value from
GA4.

## Decision

Add a native GA4 connection and four read-only, project-scoped MCP tools.

### Authentication and setup

Use a dedicated Better Auth `genericOAuth` provider named `google-analytics`
with these scopes:

- `openid`, `email`, and `profile`, to identify the connected Google account.
- `https://www.googleapis.com/auth/analytics.readonly`, for property discovery
  and reports.

Do not add the Analytics scope to the existing `google-search-console`
provider. A separate incremental grant avoids silently widening an existing
GSC connection, allows an agency to use different Google accounts for GSC and
GA4, and makes reconnect and disconnect behavior independent.

Hosted OpenSEO can reuse its Google OAuth client. Self-hosted operators reuse
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET`, but must
also enable the Google Analytics Admin API and Google Analytics Data API and
register `/api/ga4/oauth/callback` as an authorized redirect URI. No new secret
is required.

Property discovery uses Admin API v1beta `accountSummaries.list`, followed by
`properties.get` for the selected property's reporting time zone and currency.
The Integrations UI, not an MCP tool, binds one accessible `properties/{id}` to
one OpenSEO project. This matches GSC setup: agents receive a `projectId`, while
a human controls which first-party property that project may query.

Store the mapping in `ga4_connections` for both SQLite and Postgres:

- `project_id` (unique), `organization_id`, and `property_id`;
- `property_display_name`, `property_time_zone`, and `property_currency_code`
  for clear output (refreshed from report metadata when available);
- `connected_by_user_id`, connector account ID, and connected account email;
- created and updated timestamps.

OAuth tokens stay encrypted in Better Auth's `account` table. Every service
call resolves the project connection and uses the connecting member's grant,
as `GscService` does today. Disconnecting a project removes the OAuth grant only
when that connector account is no longer used by another GA4 connection.

### Initial MCP tools

All tools are free of OpenSEO credit metering, marked read-only and
non-destructive, require `projectId`, and return the selected property, inclusive
date range, property time zone, row count, rows, pagination state, and quota
state when Google supplies it.

| Tool                                         | Purpose and fixed GA4 report                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_google_analytics_organic_landing_pages` | Organic entry-page performance. Dimensions: `hostName`, `landingPage`. Filter `sessionDefaultChannelGroup` to `Organic Search`. Metrics: `sessions`, `activeUsers`, `engagedSessions`, `engagementRate`, `keyEvents`, `sessionKeyEventRate`, `transactions`, and `purchaseRevenue`.                                        |
| `get_google_analytics_page_performance`      | Page consumption after any entry point. Dimensions: `hostName`, `pagePath`, optionally `date`. Metrics: `screenPageViews`, `activeUsers`, `userEngagementDuration`, and `keyEvents`; optional channel filter defaults to `Organic Search`.                                                                                 |
| `get_google_analytics_key_events`            | Which outcomes organic traffic produces. Dimension: `eventName`; optional compatible landing-page breakdown. Metrics: `keyEvents` and `totalUsers`. The implementation uses Data API metadata/compatibility checks and returns a clear unsupported-combination response rather than constructing arbitrary custom reports. |
| `get_search_opportunities`                   | One-call GSC + GA4 view. Fetches GSC pages and GA4 organic landing pages for the same project and date range, joins normalized page URLs, and returns both sources' raw metrics plus a transparent comparative opportunity score. Requires both connections.                                                               |

The first three tools call Data API v1beta `properties.runReport`. They expose
fixed, allow-listed dimensions and metrics instead of a generic `run_report`
surface. This keeps tool descriptions useful to an SEO agent, constrains
high-cardinality queries, and makes compatibility, output schemas, and fixtures
tractable. Ecommerce is represented by `transactions` and `purchaseRevenue`;
properties without ecommerce data receive zeros, not an error or a separate
tool. A revenue metric withheld by the caller's Analytics role is `null` with
the restriction metadata, never a false zero.

Defaults are the last 28 complete days, 100 rows, descending by the primary
volume metric. Explicit ranges are inclusive and capped at 90 days in v1. A
single response is capped at 1,000 rows even though Google's API allows more;
`offset` pagination is exposed when more rows exist. Every report sends
`returnPropertyQuota: true`.

Do not add realtime, demographic, interest, audience, user-level, custom
dimension, or custom metric inputs in v1. These either do not serve the first
SEO workflows, increase privacy/thresholding risk, or create unpredictable
compatibility and quota costs.

### Combined opportunity scoring

`get_search_opportunities` makes the "fetch at one go" workflow explicit rather
than requiring an agent to perform a lossy join in its context window.

1. Use the GSC completeness window: default to the 28 days ending three days
   ago. Query GSC by `page` and GA4 by `hostName` + `landingPage` over the same
   inclusive dates. Each API still interprets dates in its own reporting time
   zone; the response states both and warns when they differ.
2. Normalize each URL by lowercasing the host, removing its fragment and query,
   removing a default port, and removing a trailing slash except at the root.
   Preserve path case. Rows that cannot be parsed remain in an `unmatchedRows`
   summary rather than being silently discarded.
3. Candidate pages have GSC impressions and an average position from 4 through 20. For the returned candidate set, calculate percentile ranks for
   `log1p(impressions)`, `sessionKeyEventRate`, and ranking reachability
   (`position` 4 is highest, 20 is lowest).
4. Calculate the score with this versioned formula:

   ```text
   opportunityScore = round(
     100 * (0.5 * demand + 0.3 * businessValue + 0.2 * reachability)
   )
   ```

   If the property has no key events, substitute `engagementRate` and set
   `businessValueFallback: "engagementRate"`.

The score is a relative ordering aid, not a forecast. Output includes the three
components, formula version, raw GSC and GA4 metrics, and join status so an agent
can explain or ignore the ranking. A later product decision may recalibrate the
weights from observed outcomes without changing the source data contract.

The first combined workflows are:

- high-demand pages in positions 4–20 that already create key events;
- high-impression pages with weak organic engagement, suggesting intent/content
  mismatch rather than only a title problem;
- pages losing both GSC clicks and GA4 organic sessions across comparable
  periods; and
- pages with strong engagement or revenue but low search visibility, suitable
  for content refreshes, internal links, or keyword expansion.

OpenSEO must use its native GSC API connection for GSC metrics. GA4 can expose
some Search Console metrics only when the customer configured a GA4-to-GSC
product link; depending on that optional link would make the combined tool
unreliable and duplicate OpenSEO's existing GSC contract.

### Quotas, failures, and privacy

Google charges Data API property quotas according to rows, columns, filters,
date range, cardinality, and event volume. The service therefore:

- uses only Core `runReport`, `getMetadata`, and `checkCompatibility` methods;
- clamps date ranges, dimensions, metrics, filters, and rows server-side;
- includes `returnPropertyQuota: true` and surfaces remaining quota without
  exposing tokens or account identifiers;
- maps 401/403 to a reconnect prompt, 429 to a retryable quota response, and
  preserves Google's safe error detail for invalid report combinations; and
- does not persist report rows in v1. A later cache must be scoped to project,
  property, normalized request, and date range, with a documented retention
  policy.

Responses may contain thresholding or sampling metadata. Surface those flags in
structured output and agent-facing text. Never infer missing rows as zero when
Google reports thresholding. Do not log raw rows, OAuth credentials, or report
filters; instrumentation records only tool name, project/organization IDs,
duration, outcome, row count, and Google quota/error category.

## Implementation shape

Follow the existing GSC boundaries:

- shared provider IDs/scopes and self-hosted setup constants;
- SQLite and Postgres schema parity plus migrations;
- `Ga4ConnectionRepository`, `Ga4Service`, and a small validated GA4 REST
  client;
- project-scoped TanStack server functions for grant status, property listing,
  selection, and disconnect;
- an Integrations connection card and selected-property state; and
- explicitly registered MCP tools wrapped by the existing project auth,
  response formatter, output-schema validation, and instrumentation.

The GA4 REST client must validate response shapes before service code consumes
them. Report builders own the allow-lists, date clamping, pagination, organic
filter, ordering, and URL normalization so UI and MCP callers cannot drift.

## Tests and fixtures

The implementation is not complete without deterministic fixtures and tests for:

- OAuth URL scopes, hosted and self-hosted callbacks, encrypted grant storage,
  refresh-token preservation, revoked grants, and independent GSC/GA4 grants;
- paginated `accountSummaries.list`, inaccessible properties, selecting a
  property from a different connector account, reconnect, and shared-grant
  disconnect behavior;
- SQLite/Postgres schema parity and one-property-per-project enforcement;
- exact `runReport` bodies for every tool, including organic filter, ordering,
  date clamp, row clamp, offset, and `returnPropertyQuota`;
- normal, empty, zero-ecommerce, incompatible, thresholded/sampled, 401/403,
  429, and malformed Google responses;
- MCP project authorization, annotations, text/structured output agreement,
  output-schema validation, and no-credit behavior;
- URL joining across query strings, fragments, trailing slashes, default ports,
  subdomains, invalid URLs, and case-sensitive paths;
- the score formula, ties, no-key-event fallback, unmatched rows, and differing
  GSC/GA4 time zones; and
- UI grant/property states plus self-hosted missing-API configuration guidance.

Fixtures should be minimal recorded-shape JSON owned by the test suite, with
property IDs, domains, emails, tokens, and business data replaced by obvious
synthetic values. Tests must not call live Google APIs.

## Non-goals

- GA4 Admin API writes, property/tag setup, key-event creation, or user access
  management.
- A generic GA dashboard, arbitrary report JSON, realtime reports, funnels,
  audiences, cohorts, BigQuery export, advertising reports, or user-level data.
- Requiring GSC and GA4 to use the same Google account or requiring a GA4-to-GSC
  product link.
- Claiming that GSC clicks equal GA4 sessions, or joining daily rows as though
  both products share attribution and time-zone semantics.
- Historical report storage, scheduled imports, cross-project rollups, or
  automatic SEO changes based on the score.

## Consequences

- Existing GSC users must explicitly connect Analytics; no current grant is
  widened or invalidated.
- Self-hosted setup gains two API-enable steps and a second callback URL, but no
  additional credential or secret.
- Fixed SEO reports give agents high-signal tools and a stable contract at the
  cost of deferring arbitrary analytics questions.
- The combined tool becomes OpenSEO's differentiated workflow while preserving
  source provenance and making its heuristic auditable.

## References

- [Google Analytics Admin API: `accountSummaries.list`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
- [Google Analytics Admin API: properties](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties)
- [Google Analytics Data API: `runReport`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [Google Analytics Data API dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Google Analytics Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- [Google Analytics Data API: `checkCompatibility`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility)
- [Google Analytics Data API: `getMetadata`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata)
- [Google Analytics Data API: response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData)
- [OpenSEO GSC integration decision](./0003-google-search-console-integration.md)
