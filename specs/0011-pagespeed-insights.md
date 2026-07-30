# 0011 — PageSpeed Insights integration (fork-only)

Status: accepted (fork feature).

## Context

The repo already stores Lighthouse results (`audit_lighthouse_results`), but
they come from DataForSEO's OnPage Lighthouse task inside the site-audit
workflow: they cost credits, they only run as part of a full audit, and they
are **lab data only**.

Google's PageSpeed Insights v5 API returns the same Lighthouse categories for
free, and adds the thing the current pipeline has no source for at all:
**CrUX field data** — real-user LCP, INP, and CLS percentiles from Chrome
telemetry, with a FAST/AVERAGE/SLOW verdict. Lab data says what a synthetic
run measured; field data says what actual visitors experienced. Core Web
Vitals are a ranking input on the field numbers, not the lab ones, so this is
the first surface in OpenSEO that reflects what Google actually scores.

Endpoint:

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
    ?url=…&strategy=mobile|desktop&category=…(repeated)&key=…
```

Probed live 2026-07-29:

- **A key is mandatory.** A keyless call returned HTTP 429 in 0.55 s with
  `quota_limit_value: "0"` and `quota_limit: "defaultPerDayPerProject"` —
  the anonymous tier is not "low quota", it is _zero_ quota. The historical
  advice that PSI works keyless no longer holds, so the integration treats a
  missing key as an unconfigured state, never as a degraded-but-working one.
- Calls take 10–30 s. Two strategies per URL run concurrently, so a single
  URL's run is bounded by the slower of the two, not their sum.
- `category` is a repeated query parameter, not a comma list.
- **HTTP 400 is overloaded.** A valid key testing an unreachable URL returns
  400 with `errors[0].reason: "lighthouseUserError"` and a specific message
  (`FAILED_DOCUMENT_REQUEST … net::ERR_CONNECTION_FAILED`), which is
  indistinguishable by status alone from a rejected key. The client branches
  on `reason` and passes Google's own message through, because telling
  someone their key is broken when the page is simply down would send them
  to regenerate a working credential.

Response shape used (parsed leniently with `z.looseObject`):

- `lighthouseResult.categories[performance|accessibility|best-practices|seo].score`
  — 0–1 float, stored ×100 as an integer.
- `lighthouseResult.audits[…].numericValue` for `largest-contentful-paint`,
  `cumulative-layout-shift`, `total-blocking-time`, `first-contentful-paint`,
  `speed-index`, `server-response-time`.
- `lighthouseResult.fetchTime`.
- `loadingExperience.metrics[LARGEST_CONTENTFUL_PAINT_MS |
INTERACTION_TO_NEXT_PAINT | CUMULATIVE_LAYOUT_SHIFT_SCORE].percentile` plus
  `loadingExperience.overall_category`. **CLS percentiles arrive ×100**
  (percentile `5` means CLS `0.05`) — the one unit trap in the response.
- `loadingExperience.origin_fallback: true` means Google had no URL-level
  CrUX data and substituted origin-level data. Recorded as
  `fieldSource: "origin"` so the UI can label it rather than passing
  origin-wide numbers off as the page's own.
- Field data is **absent entirely** for low-traffic URLs. Every field column
  is nullable and the UI has an explicit empty state; this is the normal case
  for most pages on most sites, not an error.

## Decision

- **The API key is an instance-level env secret** (`PAGESPEED_API_KEY` via
  `getRequiredEnvValue`), exactly like `VERCEL_TOKEN` and
  `DATAFORSEO_API_KEY`. No per-tenant secret storage: the repo has no
  encryption-at-rest layer, and the Bing work explicitly removed an unbuilt
  API-key crypto path rather than half-build one. The key is free and needs no
  billing account.
- **There is no `psi_connections` table.** Nothing external is being linked —
  the key is instance-level and the targets are plain URLs. "Configured"
  is simply `hasPagespeedApiKey()`. The per-project state that does exist is
  the URL list, so that is what gets a table.
- **`psi_urls`** — the URLs monitored per project. The project homepage is
  seeded lazily as an ordinary row (flagged `isHomepage`) the first time the
  overview loads with an empty list and a non-null `projects.domain`. An
  ordinary row rather than an implicit virtual entry keeps every query, chart,
  and foreign key uniform. Capped at 20 URLs per project to bound quota use and "run all"
  duration — at 2 calls per URL per run that is 40 calls a day, well inside
  the 25k/day key quota. Each URL has a `scheduleEnabled` toggle: a paused URL
  stays monitored and keeps its history, but only runs on request.
- **`psi_snapshots`** — one row per URL × strategy × run, holding the four
  category scores, six lab metrics, and the three field metrics plus their
  verdict and source. History is the point: two runs of the same URL make a
  trend line, which is what turns this from a spot check into monitoring.
- **Failed runs are stored as rows** with `errorMessage` set and metrics null,
  matching the `audit_lighthouse_results` convention, so "last run failed" is
  visible per URL without a separate status table.
- **Runs are per-URL server functions**, not a Workflow. One run is two
  concurrent `fetch`es — long in wall-clock but near-zero CPU, which is what
  Workers actually limits. "Run all" is a client-side sequential fan-out over
  the per-URL mutation, so each row reports its own progress and one failure
  cannot abort the rest.
- Client (`src/server/lib/pagespeedClient.ts`) → repositories →
  `PagespeedService` → server fns → a **PageSpeed page** per project, plus a
  read-only `get_pagespeed_insights` MCP tool returning the latest snapshot
  per URL with deltas against the previous run.

## Consequences

- A missing `PAGESPEED_API_KEY` renders a setup card on both the settings card
  and the page, never an error boundary — the Vercel pattern.
- 400/403 (bad or restricted key) and 429 (quota) are expected failures: they
  surface as a setup prompt or a plain-language quota message, not a fault.
- **Drill-down payloads (added after v1).** Each run stores its extracted
  Lighthouse issues in R2 (`r2Key`, `payloadSizeBytes`), which is what the
  "What to fix" panel reads. The **raw** vendor response is deliberately not
  kept: a live response measured 347,642 bytes, and at daily-sweep cadence
  that is ~7 MB per project per day of mostly-unread JSON. The compacted
  envelope holds the issues and scores only — lab metrics are already snapshot
  columns. Issue extraction is shared with the DataForSEO audit path
  (`buildStoredLighthouseIssues`), since PSI returns the same Lighthouse
  `audits`/`categories` shapes including `auditRefs`. A run whose upload fails
  still stores its metric row with a null `r2Key`; the panel then says to
  re-run rather than erroring.
- **Scheduled runs (added after v1).** A daily sweep rides the existing `*/15`
  cron: the handler only dispatches, and `PagespeedSweepWorkflow` does the slow
  work with one durable step per URL. `psi_urls.nextRunAt` is advanced before
  the workflow starts, so a crash costs a missed day rather than a retry storm,
  and `computeNextPagespeedRunAt` steps in whole intervals from the previous due
  time so a late sweep keeps its daily slot. `psi_snapshots.trigger` separates
  manual from scheduled runs. On hosted, sweeps are gated to paid plans — the
  quota belongs to the instance operator and is shared across tenants. Cron
  does not fire in the Docker self-host path, where "Run all" is the manual
  equivalent.
- The MCP tool reads only the local database, so unlike the Vercel tool it is
  `openWorldHint: false` and cannot itself burn PSI quota.
- The trend chart needs at least two runs before it shows anything; the page
  says so rather than rendering an empty chart.
- Fork-only migrations claim numbers upstream may reuse — the same standing
  cost specs 0009 and 0010 record. Renumber on upstream sync.
