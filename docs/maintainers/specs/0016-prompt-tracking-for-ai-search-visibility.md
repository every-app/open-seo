# Prompt tracking for AI search visibility

## Status

Proposed (October 2026). Builds on the stateless Prompt Explorer and Brand Lookup pages and on the DataForSEO metering from `docs/maintainers/specs/0002-hosted-dataforseo-metering-with-autumn.md`.

## What it does

A project owner saves the prompts their buyers actually type into AI engines — "best seo tool for small business", "openseo vs ahrefs", "how do I track my visibility in ChatGPT" — chooses which models to watch (ChatGPT, Claude, Gemini, Perplexity), and OpenSEO runs that set once a day. Each run records whether the brand was mentioned, which sources the answer cited, and the answer itself, so the project gets a visibility trend over time the same way rank tracking gives it a position trend.

The list page shows every tracked prompt with its recent mention rate and the status of its last run. A prompt's detail page shows the trend per model, the runs behind it, and the stored answers with their citations. Adding a prompt runs it immediately, so the first data point exists the moment it is created.

This is the difference between "ask ChatGPT once and screenshot it" and knowing whether last month's content work moved the answer. Today the explorer answers a question and forgets it; nothing in the product can say whether visibility went up or down.

## How it works

**Tracked prompts.** Each tracked prompt belongs to a project and stores the prompt text, the brand whose mention counts as a hit (required, defaulting to the project's own domain), the models to run, and whether the answer may use web search and from which country. A per-plan cap bounds how much one project can queue for the daily pass. The prompt text and brand are fixed at creation: editing either would silently splice unrelated runs into one trend line, so changing what you track means removing the prompt and adding a new one. The model set is editable — a removed model simply stops producing points.

**Runs.** The daily scheduler that already drives the other recurring checks materializes that day's runs, and the frequent tick already in the scheduler drains them in batches, so a large prompt set cannot exhaust a single tick. Each prompt fans out to its models through the same request the interactive explorer makes, minus the short-lived response cache — a scheduled run must see today's answer, not yesterday's. Each run records the resolved model name, whether the brand was mentioned, the citations, the fan-out queries, and the answer text, kept in object storage alongside the run and expiring with the run's history. A run that cannot be metered is recorded as skipped with the reason shown in the UI, and the next pass tries again; tracking never spends credits the organization does not have.

**Visibility metrics.** Mention rate is mentioned runs over successful runs, per model and across the set. Days with no successful run — billing skip, upstream outage — appear as gaps rather than zeros, because a zero claims the brand was absent when the truth is that nobody asked. Citations and answers are browsable per run, so a move in the trend can be read next to what the engine actually said that day.

**History.** Runs are kept for a rolling ninety days and pruned by the same scheduled pass, so history ages out instead of growing without bound. Because every run is a real paid request, total volume is bounded by the prompt cap and the daily cadence rather than by user activity.

**Interface.** A new entry under Research — Prompt Tracking — behind the same paid-plan gate as the rest of AI Visibility. The list page adds, pauses, resumes, and removes prompts; the detail page carries the trend chart, a per-model grid, and the run history with stored answers. URLs stay shareable the way the explorer's are.

**Billing.** Scheduled runs spend the organization's credits through the same meter as the interactive pages, so tracking spend is visible and bounded exactly like one-off exploration. Self-hosted installs run the same pipeline ungated, as the rest of AI Visibility already does.

## Alternatives considered

- **Re-running prompts by hand when someone remembers.** The status quo. No trend, and the answer that mattered three weeks ago is gone because nothing stored it.
- **Letting the explorer's visit-driven history stand in for tracking.** The query cache and the browser's recent-searches list expire and die with the tab; a chart built from visits measures who looked, not what the engines said.
- **Using the corpus metrics Brand Lookup already fetches — mention aggregates, top queries — as the tracked signal.** That data answers "what does the conversation about this category look like", not "does this prompt name this brand", and it cannot accept the project's own prompts, which is the product being specified here.
- **Calling each engine's API directly.** Separate keys, separate billing, separate rate limits per engine, and the web-search parity the explorer relies on goes away; the product already reaches all four engines through one provider behind one meter.
- **Running every prompt inside one scheduled tick.** A large set would overrun the handler before finishing; materializing daily and draining in batches across the tick that already exists needs no new machinery.
- **Keeping runs in the response cache instead of a store.** The cache is read-through with a days-long TTL and no queryable shape; trends, gaps, and per-model grids need rows.
- **Per-prompt cadences (daily, weekly, monthly).** One daily rhythm matches rank tracking and keeps every grid comparable; extra cadences multiply scheduler states for no new information at daily resolution.

## Not in scope

Tracking Brand Lookup's corpus numbers (share of voice, top queries, mention volume) as time series; exposing tracked prompts and results as MCP tools; sentiment or position scoring beyond the brand-mention check; backfilling a trend for prompts thought of retroactively; editing a tracked prompt's text in place; model choice beyond the existing four; non-daily schedules.

## Later

- A scheduled summary of visibility changes wherever the product already sends scheduled reports.
- Corpus-metric tracking beside prompt tracking, reusing the same history machinery.
- MCP read access to tracked prompts and their latest runs.
