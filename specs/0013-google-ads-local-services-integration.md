# Google Ads Local Services integration

## Status

Accepted

## Context

Local businesses that advertise on Google increasingly do so through Local
Services Ads (LSA) rather than classic Search campaigns. LSA spend, lead
volume, charged-lead status, and per-lead details are only available through
the Google Ads API: DataForSEO (the app's SERP/keyword vendor) has no Local
Services data source, and the LSA web console has no export API.

Reading the Google Ads API requires two credentials with different owners: a
developer token that belongs to the operator (approved by Google per Cloud
project, with an "access pending" period that can last days), and an OAuth
grant with the `adwords` scope that belongs to the end user. LSA accounts are
frequently reachable only through a manager account, in which case API calls
must carry the manager's id as a `login-customer-id` header while querying
the LSA account itself.

## Decision

Mirror the Search Console and Analytics integration shape: a user-level
Google OAuth grant plus a project-level account selection, stored in a
`google_ads_connections` table in both dialects.

- The OAuth provider is registered through the same better-auth
  `genericOAuth` path as GSC/GA4 in hosted mode, and through the shared
  self-hosted Google OAuth helper (own callback route, own state namespace)
  in self-host mode.
- Account discovery lists customers reachable by the grant
  (`listAccessibleCustomers`), expands manager hierarchies via
  `customer_client`, and records `login_customer_id` on the connection when
  the selected account is reached through a manager — the LSA account, not
  the manager, is what the connection points at.
- The connection stores the account's own reporting time zone so report
  windows can be built in the zone Google evaluates `segments.date` in.
- The developer token is operator configuration (`GOOGLE_ADS_DEVELOPER_TOKEN`).
  When unset, the integration is invisible apart from an informational
  preflight entry; nothing else in the product depends on it.
- The API client is a small REST wrapper over `googleads.googleapis.com`
  (`searchStream` for GAQL reads) rather than the official client library.
- "Access pending" (developer token or Cloud project not yet approved, Ads
  API not yet enabled) is modeled as an explicit, expected state and surfaced
  as such in the settings UI, not treated as an error.

Reporting surfaces (Local Services performance and lead listings as MCP
tools, and lead-feedback filing) build on this connection and are specified
as follow-ups to keep review units small.

## Rationale

- One integration pattern for all Google products keeps the settings UI,
  disconnect/erasure paths, and workspace-merge behavior uniform — the
  connection row participates in GDPR erasure and legacy-workspace merges
  exactly like GSC/GA4 connections do.
- The official Google Ads client library is built around gRPC and heavy
  generated stubs; the Workers runtime favors a thin `fetch`-based REST
  client, and the integration needs only a handful of endpoints.
- Storing the selected LSA account (with an optional manager login id)
  rather than the manager keeps lead queries unambiguous: leads exist on the
  LSA account, and the same grant may reach many client accounts.
- A per-account stored time zone avoids the classic off-by-one-day class of
  reporting bugs when the operator's server timezone differs from the Ads
  account's.

## Consequences

- Self-hosters who want LSA reporting must obtain a Google Ads developer
  token and wait out Google's approval; the docs walk through it, and the
  product degrades gracefully (feature hidden) without it.
- The grant carries the broad `adwords` scope — the narrowest scope Google
  offers that can read LSA data. The integration only issues reads, but the
  scope itself would permit writes; this is inherent to the API.
- Google's v25 API prohibits selecting `credit_details` on lead queries, so
  charged-lead credit state is only available at the granularity the lead
  list exposes (`credit_state`), which constrains how precisely credit
  outcomes can be reported.
- Manager-reached accounts depend on the stored `login_customer_id` staying
  valid; if the manager link is severed, calls fail with an explicit
  reconnect state rather than silently returning empty data.
