# Google Search Console integration

## Status

Accepted

## Context

Users previously got Search Console data into OpenSEO by manually exporting CSVs. We want the agent to read a project's real first-party search data (clicks, impressions, CTR, position) directly. Google does not charge for this data, so it should not consume credits the way DataForSEO does.

## Decision

Add a native GSC connection plus two read-only MCP tools.

**Auth (incremental OAuth grant).** Connecting requests a read-only Search Console scope through the app's own Google OAuth flow (`/api/gsc/oauth/callback`), separate from logging in with Google. Better Auth still handles login only. The grant is stored in the `account` table under the `google-search-console` provider ID, keyed by OpenSEO user and Google account, and its tokens are encrypted at rest. Any Google account can back the grant, including one whose email differs from the OpenSEO login (an agency connecting a client) and one that another OpenSEO user has also connected. The OAuth state is a single-use nonce stored server-side and deleted by the first callback that presents it, so a captured consent URL cannot be replayed. It binds the flow to the user and the provider, and a PKCE verifier derived from that state binds the code to the flow.

The first version used a Better Auth `genericOAuth` provider. Better Auth treats every linked account as a login identity, so it refused to link one Google account to a second OpenSEO user. That blocked people with two OpenSEO logins and members of one organization who share a client Google account, so the flow moved out of Better Auth.

**Scoping.** A connection maps one verified property to one project (`gsc_connections`, unique per project). The connection belongs to the project/workspace; any member can query it, and requests run under the connecting member's grant. Property selection lives in the Integrations UI (account dropdown), not an MCP tool.

**MCP tools** — read-only, free (no Autumn metering), scoped to a project the caller's workspace owns:

- `get_search_console_performance`: thin pass-through of Search Analytics (group by query/page/country/device/date, simple AND filters, ≤1000 rows with offset paging, 16-month and ~3-day-lag clamps).
- `inspect_urls`: URL Inspection for 1–10 URLs with per-URL partial results; connection-level failures (not connected / expired grant) abort the call with a reconnect prompt.

Whether an inspected URL belongs to the property is enforced by Google's API, not re-checked locally, so both `sc-domain:` and URL-prefix properties work.

**Disconnect** removes the project's property mapping and unlinks the OAuth grant only when its connector has no other connected project — never as a side effect of a different member disconnecting.

## Rationale

Leaning on Better Auth's incremental OAuth keeps token storage and refresh out of feature code. Per-project property mapping matches how teams work (a different site per project) and keeps queries scoped to a workspace the caller owns. Treating GSC reads as free reflects that Google doesn't bill for them and makes connecting an activation hook rather than a metered cost.

## Consequences

- The read-only scope is a Google "sensitive" scope: until the OAuth app clears verification, only test users can connect and their grant expires ~weekly.
- "Connected by" surfaces the OpenSEO member who connected, not the Google account's email.
- One property per project (re-selecting replaces it); no history or caching — every query hits Google live.
- New GSC capabilities should extend `GscService` and the MCP tools, keeping reads free and project-scoped.
