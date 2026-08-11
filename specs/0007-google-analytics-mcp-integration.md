# Google Analytics MCP integration

## Status

Accepted (2026-08-05) by the OpenSEO maintainer under EVE-33.

Implementation update (2026-08-06): the EVE-33 branch now implements the
connection lifecycle, dashboard/settings UI, and the four reports specified
below. Follow-up work on the same branch adds six bounded read-only tools for
organic overview, traffic acquisition, measurement health, ecommerce, site
search, and audience breakdowns. The implementation has been verified locally
but is not shipped until the branch is reviewed, merged, and deployed. The
remainder of this document preserves the originally accepted decision and
milestone language.

## Context

OpenSEO can read a project's Google Search Console (GSC) property, but an agent
cannot see what visitors do after the click. GA4 adds first-party signals such
as organic sessions, engagement, key events, transactions, and revenue. The
first release should answer SEO questions without exposing an unrestricted
analytics report builder.

GA4 and GSC remain separate sources. They use different attribution rules,
reporting time zones, and definitions, so their counts are not interchangeable.
The supported join is page-level correlation: search demand and visibility
from GSC alongside engagement and business value from GA4.

## Maintainer decision

Accept the design proposed in [PR #106](https://github.com/every-app/open-seo/pull/106)
with these clarifications:

- The GA4 grant and the project-to-property mapping have separate owners and
  lifecycles.
- Each MCP tool has a fixed request body, bounded inputs, a discriminated
  success/error output, and stable privacy and quota metadata.
- A restricted metric is `null`; an omitted or thresholded row is unknown and
  is never synthesized as zero.
- GA4 page joins use a host-and-path key because the `hostName` and
  `landingPage` dimensions do not provide a URL scheme.
- GSC dates use `America/Los_Angeles`; GA4 dates use the selected property's
  IANA time zone. The combined tool reports both.
- Implementation is divided into backend/service milestones and thin adapter
  milestones. Merging this document alone does not expose a tool or UI.

PR #106's review found that the key-events report could attribute all-channel
events to organic traffic. The proposal fixed that finding. This accepted
contract keeps `Organic Search` as the default and makes any all-channel
request explicit in both the input and output.

## Decision

The original decision adds a native GA4 connection and four read-only,
project-scoped MCP tools. The implementation update above records the six
subsequently approved tools without rewriting the historical contract.

### Authentication and grant ownership

Use a dedicated Better Auth `genericOAuth` provider named `google-analytics`.
It requests these scopes:

- `openid`, `email`, and `profile` identify the connected Google account.
- `https://www.googleapis.com/auth/analytics.readonly` discovers properties
  and reads reports.

Do not add the Analytics scope to `google-search-console`. A separate grant
keeps GSC access unchanged, allows an agency to use different Google accounts
for GSC and GA4, and gives GA4 its own reconnect and disconnect lifecycle. No
Analytics write scope is allowed.

The connecting OpenSEO user owns the Better Auth grant. Better Auth stores its
OAuth access and refresh tokens, encrypted at rest, in the `account` table
under the `google-analytics` provider ID. Feature tables must not copy those
tokens. Refresh-token rotation preserves the existing encrypted refresh token
when Google omits a new one.

Hosted OpenSEO reuses its Google OAuth client. A self-hosted operator reuses
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_SECRET`, enables
the Google Analytics Admin API and Google Analytics Data API, and registers
`/api/ga4/oauth/callback`. GA4 adds no application secret.

### Property mapping ownership

Property discovery paginates Admin API v1beta `accountSummaries.list` and then
calls `properties.get` for the selected property's time zone and currency.
Only the Integrations UI can select a property. MCP tools accept a `projectId`;
they cannot list, select, or change properties.

The `ga4_connections` row belongs to the OpenSEO project and organization, not
to the connecting user. Any current member who can access the project can read
through the mapping. The service still executes the Google request through the
specific connector account that selected the property.

`ga4_connections` has matching SQLite and Postgres definitions:

- `id`, `project_id` (unique), and `organization_id`;
- `property_id`, stored as the canonical `properties/{id}` resource name;
- `property_display_name`, `property_time_zone`, and
  `property_currency_code`;
- `connected_by_user_id`, `ga4_account_id`, and
  `connected_account_email`; and
- created and updated timestamps.

The server function for selection receives `projectId`, `propertyId`, and the
connector account ID. Project authorization supplies `organizationId` and the
current user. `Ga4Service` verifies that the current user owns that connector
grant and that the exact property appears in a fresh discovery response before
upserting the mapping. Clients cannot submit `organizationId`,
`connectedByUserId`, account email, time zone, currency, or display name.

Disconnecting always deletes the project's mapping. It deletes the Better Auth
grant only when the caller owns that grant and no other GA4 connection refers
to the same `(connected_by_user_id, ga4_account_id)` pair. A different project
member may remove the project mapping but cannot unlink another user's grant.

### Fixed report inputs

Every tool requires `projectId`. The three GA4-only tools also accept this
common input:

| Field       | Contract                                        |
| ----------- | ----------------------------------------------- |
| `startDate` | `YYYY-MM-DD`; must be supplied with `endDate`   |
| `endDate`   | `YYYY-MM-DD`; must be supplied with `startDate` |
| `limit`     | Integer from 1 through 1,000; default 100       |
| `offset`    | Non-negative integer; default 0                 |

With no explicit dates, the range is the last 28 complete days in the GA4
property time zone. Explicit ranges are inclusive. The report builder caps the
end at the last complete property day and moves the start forward when the
range exceeds 90 days. The response returns requested and resolved dates plus
`end_date_clamped` or `start_date_clamped` warnings. Invalid date formats,
reversed dates, and a single date without its pair return `validation_error`
before an API call.

Only these tool-specific inputs are accepted:

- `get_google_analytics_organic_landing_pages` has no additional report input.
- `get_google_analytics_page_performance` accepts `includeDate` (boolean,
  default `false`) and `channel` (`organic_search | all`, default
  `organic_search`).
- `get_google_analytics_key_events` accepts `breakdown`
  (`event | event_and_landing_page`, default `event`) and the same `channel`
  enum and default.
- `get_search_opportunities` accepts the shared date pair and `limit` from 1
  through 100, default 50. It does not expose source offsets or report-builder
  inputs.

The adapters reject unknown fields. Callers cannot provide property IDs,
dimensions, metrics, filter expressions, order clauses, currency, time zone,
or arbitrary GA4 request JSON.

### Fixed reports

The first three tools call Data API v1beta `properties.runReport`. Every
request sets `keepEmptyRows: false` and `returnPropertyQuota: true`.

| Tool                                         | Fixed request                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_google_analytics_organic_landing_pages` | Dimensions `hostName`, `landingPage`; metrics `sessions`, `activeUsers`, `engagedSessions`, `engagementRate`, `keyEvents`, `sessionKeyEventRate`, `transactions`, `purchaseRevenue`; exact `sessionDefaultChannelGroup = Organic Search` filter; order by `sessions` descending |
| `get_google_analytics_page_performance`      | Dimensions `hostName`, `pagePath`, plus `date` only when requested; metrics `screenPageViews`, `activeUsers`, `userEngagementDuration`, `keyEvents`; exact organic channel filter unless `channel = all`; order by `screenPageViews` descending                                 |
| `get_google_analytics_key_events`            | Dimension `eventName`, plus `hostName`, `landingPage` only for the requested breakdown; metrics `keyEvents`, `totalUsers`; exact organic channel filter unless `channel = all`; order by `keyEvents` descending                                                                 |

The service owns these arrays and builders. `getMetadata` and
`checkCompatibility` may validate the key-event landing-page combination. An
unsupported combination returns `ga4_report_incompatible`; it never falls back
to a custom report.

Properties without ecommerce events return numeric zeros where GA4 returned a
row with zero ecommerce metrics. If response metadata says the caller's role
restricts `purchaseRevenue`, the service returns `purchaseRevenue: null` and
includes the restriction. It does not turn a restricted value into zero.

Realtime, demographic, interest, audience, user-level, custom-dimension, and
custom-metric inputs are excluded from v1. These reports do not consume OpenSEO
credits.

### Success output

Each GA4-only tool returns the same envelope with a tool-specific `rows` type:

```text
{
  status: "ok",
  source: {
    provider: "google_analytics",
    propertyId,
    propertyDisplayName
  },
  request: {
    requestedDateRange,
    resolvedDateRange,
    propertyTimeZone,
    currencyCode,
    channel,
    limit,
    offset
  },
  rowCount,
  totalRowCount,
  rows,
  pageInfo: { offset, limit, hasMore, nextOffset },
  reportMetadata: {
    dataLossFromOtherRow,
    subjectToThresholding,
    sampling: [{ samplesReadCount, samplingSpaceSize }],
    restrictedMetrics: [{ metricName, restrictedMetricTypes }],
    emptyReason,
    hasLimitedData
  },
  quota: {
    tokensPerDay,
    tokensPerHour,
    concurrentRequests,
    serverErrorsPerProjectPerHour,
    potentiallyThresholdedRequestsPerHour,
    tokensPerProjectPerHour
  } | null,
  warnings
}
```

`rowCount` is the number of rows in this response. `totalRowCount` is Google's
validated `rowCount` for the full query before `limit` and `offset`.
`hasMore` is `offset + rowCount < totalRowCount`; `nextOffset` is
`offset + rowCount` when `hasMore` is true and `null` otherwise. Each quota
field is `{ consumed, remaining }` when Google provides it. Quota numbers never
include OAuth credentials.

`sampling` keeps Google's integer counts as decimal strings. The other metrics
are parsed to finite numbers after the REST response passes Zod validation.
`hasLimitedData` is true when thresholding, sampling, an `(other)`-row loss, or
a metric restriction is present. Thresholding does not prove that a particular
row is absent, so agent-facing text says the report may be limited. Missing
rows remain missing.

The MCP adapter validates this output schema and renders text from the same
object. Structured and text outputs must agree about source, date range,
channel, row count, limitations, and errors.

### Combined search opportunities

`get_search_opportunities` uses the native GSC connection and the GA4 organic
landing-page report. It never depends on an optional GA4-to-GSC product link.

The default range is the 28 days ending three days ago. Both sources receive
the same inclusive date strings. GSC interprets them in
`America/Los_Angeles`; GA4 interprets them in the selected property's time
zone. The response includes both zones and a `source_time_zones_differ`
warning when they differ.

The service considers at most 1,000 rows from each source in v1. GSC returns
top rows rather than guaranteed complete data. The result therefore includes
`coverage` with source row counts and `gscRowsTruncated` and
`ga4RowsTruncated` flags. Agent-facing text must not call a truncated result a
complete site inventory. `gscRowsTruncated` is true whenever GSC fills its
1,000-row cap because GSC does not return a total row count;
`ga4RowsTruncated` is true when GA4's `totalRowCount` exceeds the number of rows
considered.

The combined success envelope includes `gscTimeZone`, `ga4TimeZone`,
`coverage`, `rows`, `unmatchedRows`, `warnings`, the full GA4
`reportMetadata`, and the GA4 `quota` object defined above. If GA4 reports
thresholding, sampling, other-row loss, or metric restrictions, the combined
tool preserves the same fields, sets `ga4_data_limited`, and says that an
unmatched GSC page may have omitted GA4 data. It never interprets an unmatched
page as having zero sessions, engagement, events, transactions, or revenue.

The join key is normalized host plus path:

1. Lowercase the host and remove a default port.
2. Ignore the URL scheme, fragment, and query string.
3. Remove a trailing slash except at the root.
4. Preserve path case and preserve subdomains. Do not equate `www.example.com`
   with `example.com`.
5. Treat `(not set)`, an empty host/path, and invalid GSC URLs as unmatched.

GA4 supplies `hostName` and `landingPage`; GSC supplies a full page URL. The
response keeps the raw source values and the normalized key. Unparseable rows
appear in `unmatchedRows` with a stable reason code instead of disappearing.

Candidate pages have GSC impressions and average position from 4 through 20.
A candidate with no joined GA4 row remains in the output with
`joinStatus: "gsc_only"`, `ga4: null`, `businessValue: null`, and
`opportunityScore: null`. The service does not include it in the scoring
population. If GA4's metadata indicates limited data, every computed score has
`scoreDataLimited: true`; the score still ranks returned aggregates but cannot
be used to rank unmatched pages below matched pages.

For candidates with a joined GA4 row, calculate percentile ranks for
`log1p(impressions)`, `sessionKeyEventRate`, and ranking reachability, where
position 4 is highest and 20 is lowest. Ties receive the same percentile rank.
Use this versioned formula:

```text
opportunityScoreV1 = round(
  100 * (0.5 * demand + 0.3 * businessValue + 0.2 * reachability)
)
```

If all joined candidate rows report zero key events, substitute
`engagementRate` for those returned rows and set
`businessValueFallback: "engagementRate"`. This fallback describes the rows
returned by GA4; it does not claim that the property has no key events. The
output contains the components, formula version, raw GSC and GA4 metrics, join
status, and coverage. The score ranks the joined rows; it is not a forecast.

### Error contract

Services throw typed domain errors. Server-function and MCP adapters map them
to the same discriminated output:

```text
{
  status: "error",
  error: {
    code,
    message,
    retryable,
    reconnectUrl?,
    retryAfterSeconds?,
    details?
  }
}
```

Stable codes and mappings:

| Code                        | Cause and adapter behavior                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `validation_error`          | Zod or report-builder rejection; no Google call                                                         |
| `project_forbidden`         | Project authorization failed; no connection details returned                                            |
| `ga4_not_connected`         | Project has no GA4 mapping; return the project Integrations URL                                         |
| `ga4_reconnect_required`    | Token minting failed, `invalid_grant`, or Google returned 401; include a reconnect URL                  |
| `ga4_property_inaccessible` | Google returned 403 for the mapped property; keep the mapping and ask a human to reselect or fix access |
| `ga4_report_incompatible`   | Compatibility check or Google 400 rejected a fixed combination; not retryable                           |
| `ga4_quota_exhausted`       | Google 429 or `RESOURCE_EXHAUSTED`; retryable and include a safe retry delay when available             |
| `ga4_upstream_unavailable`  | Google 5xx or network failure; retryable                                                                |
| `ga4_malformed_response`    | A 2xx response failed schema or numeric validation; not retryable                                       |
| `gsc_not_connected`         | Combined tool only; project has no GSC mapping                                                          |
| `gsc_reconnect_required`    | Combined tool only; the mapped GSC grant cannot mint a token                                            |

A 403 is not treated as proof that the OAuth grant is revoked. Adapters return
only allow-listed field names, constraints, and Google reason categories in
`details`; they never pass through a raw upstream body, OAuth credential,
account identifier, or report filter.

### Privacy, retention, and instrumentation

The service copies these GA4 response metadata fields into the success output:
`dataLossFromOtherRow`, `samplingMetadatas`, `schemaRestrictionResponse`,
`emptyReason`, and `subjectToThresholding`. Tests cover each field alone and in
combination. Agent-facing text states that limited rows are unknown, not zero.

OpenSEO does not persist report rows in v1. A later cache needs an approved
retention policy and keys scoped to project, property, normalized request, and
date range. Instrumentation records tool name, project and organization IDs,
duration, outcome, row count, and quota/error category. It does not log raw
rows, event names, page paths, filters, property IDs, connected account data,
or credentials.

## Architecture

Follow the existing application boundary:

```text
SQLite/Postgres repository -> Ga4Service -> server-function and MCP adapters
```

- `Ga4ConnectionRepository` owns mapping persistence and dialect parity.
- A small GA4 REST client owns HTTP, token use, pagination, and Zod validation
  of Admin and Data API responses.
- `Ga4Service` owns grant lookup, property verification, typed errors, fixed
  report builders, date clamps, quota/privacy normalization, URL joins, and
  opportunity scoring.
- Project-scoped TanStack server functions own session/project authorization
  and expose grant status, property listing, selection, and disconnect.
- MCP handlers own annotations, input/output schemas, response formatting, and
  registration. They do not build GA4 requests or query repositories.

The Integrations UI and MCP are consumers of the same service rules. Neither
adapter duplicates property ownership, date, channel, privacy, quota, URL, or
error logic.

## Implementation milestones

Each milestone is a focused change that can merge after its own tests pass.

### 1. Grant and mapping backend

Add shared provider constants, hosted and self-hosted OAuth paths, SQLite and
Postgres schemas/migrations, `Ga4ConnectionRepository`, the Admin API client,
and the connection lifecycle in `Ga4Service`. Verify scope isolation,
refresh-token preservation, property ownership, reconnect, shared-grant
disconnect, and dialect parity. This milestone has no MCP tools.

### 2. Fixed-report service

Add the validated Data API client, fixed request builders, typed rows and
errors, date and row clamps, privacy/quota normalization, and deterministic
fixtures. Unit tests assert the exact `runReport` body for every allowed input
variant. This milestone has no server-function or MCP report adapter.

### 3. Opportunity service

Add host/path normalization, native GSC and GA4 orchestration, coverage and
unmatched-row reporting, the v1 score, tie behavior, and time-zone warnings.
Tests use synthetic GSC and GA4 fixtures and no live API.

### 4. Server-function and UI adapter

Add project-scoped server functions and the Integrations card for grant,
property, reconnect, and disconnect states. The functions call `Ga4Service` and
do not access the repository or Google client directly. This milestone makes
connection management visible but does not claim that MCP tools exist.

### 5. MCP adapter

Register the four tools with read-only, non-destructive annotations, Zod input
and output schemas, no-credit behavior, instrumentation, and text/structured
output agreement. Add authorization and error-mapping tests. The capability is
shipped only when this milestone and its deployment verification are complete.

## Tests and fixtures

The implementation is incomplete without deterministic tests for:

- exact hosted and self-hosted OAuth URLs, callbacks, scopes, encrypted grant
  storage, refresh-token preservation, revoked grants, and independent
  GSC/GA4 accounts;
- paginated discovery, inaccessible properties, selection through the wrong
  connector, reconnect, member-initiated mapping removal, and shared-grant
  disconnect behavior;
- SQLite/Postgres schema parity and one-property-per-project enforcement;
- exact report bodies for each tool and allowed variant, including organic
  filter, order, dates, clamps, limit, offset, `keepEmptyRows: false`, and
  `returnPropertyQuota: true`;
- normal, empty, zero-ecommerce, restricted-revenue, thresholded, sampled,
  other-row-loss, incompatible, 401, 403, 429, 5xx, network, and malformed
  responses;
- MCP project authorization, annotations, no-credit behavior, stable error
  codes, output-schema validation, and text/structured agreement;
- host/path joins across schemes, query strings, fragments, trailing slashes,
  default ports, subdomains, `(not set)`, invalid URLs, and case-sensitive
  paths;
- score components, ties, no-key-event fallback, source truncation, null scores
  for GSC-only rows, GA4 limitation propagation, unmatched rows, and differing
  GSC/GA4 time zones; and
- UI grant/property states and self-hosted missing-API guidance.

Fixtures are minimal recorded-shape JSON owned by the test suite. Property IDs,
domains, emails, tokens, event names, and business data use obvious synthetic
values. Tests never call live Google APIs.

## Non-goals

- GA4 Admin API writes, tag setup, key-event creation, or user access changes.
- A generic dashboard, arbitrary report JSON, realtime reports, funnels,
  audiences, cohorts, BigQuery export, advertising reports, or user-level data.
- Requiring GSC and GA4 to use one Google account or requiring a GA4-to-GSC
  product link.
- Claiming that GSC clicks equal GA4 sessions, or treating their dates as one
  reporting time zone.
- Historical report storage, scheduled imports, cross-project rollups, or
  automatic SEO changes based on the score.
- Presenting this accepted specification as a released integration.

## Consequences

- Existing GSC users must connect Analytics explicitly; no current grant is
  widened or invalidated.
- Self-hosted setup adds two API-enable steps and a second callback URL, but no
  new credential.
- Fixed reports give agents stable contracts and defer arbitrary analytics
  questions.
- The combined tool preserves source provenance and exposes the limits of its
  join and score.
- Acceptance authorizes implementation work. It does not advertise GA4 as an
  available OpenSEO capability.

## References

- [Google Analytics Admin API: `accountSummaries.list`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
- [Google Analytics Admin API: `properties.get`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties/get)
- [Google Analytics Data API: `runReport`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [Google Analytics Data API: `RunReportResponse`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/RunReportResponse)
- [Google Analytics Data API dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [Google Analytics Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
- [Google Analytics Data API: `checkCompatibility`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility)
- [Google Analytics Data API: `getMetadata`](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata)
- [Google Analytics Data API response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData)
- [Search Console Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [OpenSEO GSC integration decision](./0003-google-search-console-integration.md)
