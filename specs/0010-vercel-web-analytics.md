# 0010 — Vercel Web Analytics integration (fork-only)

Status: accepted (fork feature; not proposed upstream — Vercel-only audience
on a Cloudflare-first project makes it a weak upstream fit).

## Context

Vercel shipped a public Web Analytics REST API (docs updated 2026-06-26):
`https://api.vercel.com/v1/query/web-analytics/` with `visits` and `events`
datasets, `count` and `aggregate` query styles, OData filters, and real
`since`/`until` date ranges — everything Bing's API lacks. Auth is a standard
Vercel access token (Bearer), not OAuth.

The SEO-relevant join: `referrerHostname` gives actual arrivals from search
engines AND AI assistants (claude.ai, chatgpt.com, gemini.google.com…) to set
against GSC/Bing's claimed clicks. Nobody else surfaces AI-referral traffic.

Probed live 2026-07-26 against scholar-sidekick (prj_qGaJwQZsAOXCNdIj67Bt1x4hAZgw,
team_nk9qkakAlpGDrLUqILJu9mYx):

- `GET /v9/projects?teamId=…` lists projects; the personal scope returned 0
  projects — Mark's projects live under the team scope, so teamId handling is
  mandatory, not optional.
- `visits/count` with no dates defaulted to the plan's whole reporting window
  (since 2025-09-09) and returned `{ visitors, pageviews }`.
- `visits/aggregate&by=day` returns `{ timestamp, visitors, pageviews }` rows;
  the response echoed `"limit": 10` yet returned 15 day-rows — the limit does
  not truncate time buckets.
- `visits/aggregate&by=referrerHostname&limit=N` honors the limit and folds
  the tail into a literal `"Others"` row. Direct traffic is
  `referrerHostname: ""`. `by=requestPath` behaves the same (an `"Others"`
  row appears mid-list, ordered by volume).
- Rows carry `visitors` and `pageviews` (not `views`).

## Decision

- **Token is an instance-level env secret** (`VERCEL_TOKEN` via
  `getRequiredEnvValue`), exactly like `DATAFORSEO_API_KEY`. No per-tenant
  secret storage: the repo has no encryption-at-rest layer and this fork is
  single-operator. The token needs only read access to Web Analytics.
- **Per-project mapping lives in `vercel_connections`** (both dialects,
  parity-tested): OpenSEO project → `vercelProjectId` + `teamId` +
  `projectName`. These are identifiers, not secrets.
- Client (`src/server/lib/vercelAnalytics.ts`) → `VercelAnalyticsService` →
  server fns → a **Traffic page** per project: visitors/pageviews tiles with
  a real prior-period comparison (this API has date ranges, so no half-split
  heuristics), a daily chart, a referrers table with search engines and AI
  assistants called out, and a top-pages table.
- 30-day window vs the previous 30 days for all comparisons.

## Consequences

- The `Others` bucket must be rendered as-is, never treated as a hostname or
  path.
- `referrerHostname: ""` renders as "Direct / none".
- A missing `VERCEL_TOKEN` renders a setup card (mirrors the DataForSEO help
  page pattern), not an error boundary.
- Deleting the Vercel project or revoking the token surfaces as a reconnect
  prompt (401/403 handled like Bing's expected grant failures).
- Fork-only migrations claim numbers upstream may reuse — same standing cost
  as Bing's 0037/0014; renumber on any future upstream sync.
