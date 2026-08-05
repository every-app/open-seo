# 0015 — Bing AI citations: CSV import

## Problem

Bing Webmaster Tools now reports how often a site is cited in Bing's AI /
Copilot answers ("AI performance"), but exposes no API for it — only CSV
exports from three reports:

- **Overview**: one row per day, `Date, Citations, Cited Pages`.
- **Pages**: one row per page for the export's window, `Page, Citations`.
- **Queries**: one row per grounding query for the same window,
  `Grounding Query, Intent, Topic, Citations, Citation Share`.

The existing Bing integration (specs/0009) only covers the live
clicks/impressions API. AI citations need a manual-import path, the same
shape as the RapidAPI snapshots (specs/0014): no live API exists, so a
human-uploaded CSV is the honest source of truth.

## Decision

A new "AI performance" tab on the per-project Bing Performance page, with
three sub-views, each backed by a CSV upload:

- **Overview**: uploads upsert one row per `(project, date)` —
  `bing_ai_citation_days`. Re-uploading a CSV with overlapping dates just
  overwrites those days, mirroring `rapidapi_snapshots`. This is the only
  report with a native per-row date, so it's the only one with day-level
  upsert; it drives a daily trend chart/table.
- **Pages** and **Queries**: unlike the overview, these reports carry no
  per-row date — each export reflects whatever window was picked in Bing's
  UI. Each upload is kept as its own dated **snapshot**
  (`bing_ai_citation_snapshots`, one row per upload with a user-entered
  `period_start`/`period_end`) with child rows in
  `bing_ai_page_citations` / `bing_ai_query_citations`. This preserves
  history across uploads (e.g. "how did this page's citations change
  between last month's export and this month's") rather than only ever
  showing the latest snapshot. The panel defaults to the newest snapshot
  with a picker for older ones.

CSV parsing uses `papaparse` (already a dependency). Bing's date format
(`"7/1/2026 12:00:00 AM"`) is parsed explicitly (not via `new Date()`,
which is locale-ambiguous for M/D/Y) and normalized to `YYYY-MM-DD`.
Citation Share (`"72.27%"`) is stored as a plain numeric percent.

## Data model

Both `citations` counts and the `citation_share_percent` are exactly what
Bing exports — no derived math, no cross-report joins. `project_id` is
denormalized onto the child tables (not just the snapshot header), same as
`psi_snapshots` denormalizes `project_id` alongside `url_id`, so
project-scoped reads and deletes never need a join back to the header.

- `bing_ai_citation_days`: `project_id`, `organization_id`, `date`,
  `citations`, `cited_pages`, `uploaded_by_user_id`, timestamps. Unique on
  `(project_id, date)`.
- `bing_ai_citation_snapshots`: `project_id`, `organization_id`,
  `report_type` (`pages` | `queries`), `period_start`, `period_end`,
  `row_count`, `uploaded_by_user_id`, `created_at`.
- `bing_ai_page_citations`: `snapshot_id`, `project_id`, `page`,
  `citations`.
- `bing_ai_query_citations`: `snapshot_id`, `project_id`, `query`,
  `intent`, `topic`, `citations`, `citation_share_percent`.

## Out of scope

No MCP tool yet (the existing Bing MCP tools read the live API; this is a
manually-fed table and can grow a tool later if it proves useful the way
`get_rapidapi_snapshots` did). No automatic re-fetch — same as RapidAPI,
there is nothing to poll.
