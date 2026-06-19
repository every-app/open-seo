# Onboarding agent

## Status

Proposed (June 2026) — v1 product spec, pending technical design.

> **Update (June 2026):** what shipped is a chat where Sam analyzes the site
> on demand (via `read_website` + `get_seo_metrics` tools) and writes the
> strategy in-stream, rather than the staged synthesize → persist pipeline
> described below. Persisting the strategy (the "Project Context" store + R2
> versioning) and the `get_project_context` MCP tool are **deferred to a later
> PR** — the strategy is shown in the chat but not yet saved. Sections below
> describe the original plan.

## Goal

Turn signup into activation. When a new user onboards, an "agent" analyzes
their actual website live, then proposes a tailored SEO strategy. The strategy
is free and stands on its own; _acting on it_ (rank tracking, content briefs,
the ongoing coach) is the paid surface. The strategy becomes the project's
durable "Project Context" — readable in the app and over MCP.

This is the top activation priority because it gives every new user a concrete,
personalized "here's what to do" moment before they're asked to pay.

## What "agent" means here

A **guided pipeline narrated live**, not an LLM agent loop. The steps are
mostly deterministic (scrape, fetch keyword data); a single LLM call at the end
synthesizes the strategy narrative. The "agent" feeling comes from streaming the
steps in real time ("Reading your homepage… you look like a Notion
alternative… 4 keywords ranking, 30 worth targeting…") and streaming the final
write-up token-by-token. No Anthropic SDK / agent infra is required for v1.

## The experience

**Stage 0 — Profile (extend existing onboarding forms).** Collect: domain,
experience level, and primary goal. **Website and default country are captured
on the same step**, since the country is a property of the site/project being
analyzed — keeping them together makes the relationship obvious and avoids a
stray standalone country field. That step carries a short note that they can add
more projects with different websites (and their own countries) later, so users
don't feel they must cram every site into this first one. Keep the whole stage
to ~4 fields — the onboarding UX audit flagged form friction. Country and
language become the project's default location (see Project defaults) and are
reused for every DataForSEO call going forward.

**Stage 1 — Discover (live).** Sitemap-first using existing robots.txt +
sitemap discovery; fall back to a shallow crawl. Produces a map of the site's
shape from URLs/titles. Discover many URLs (cheap); scrape few.

**Stage 2 — Read (live).** Scrape ~3–5 key pages (home + top product/nav pages)
to markdown. This is the one net-new capability: page → markdown via Cloudflare
Browser Rendering. Honest "we couldn't read your site" flagging with a manual
"tell us what you do" fallback so the run never dead-ends.

**Stage 3 — Signal (live).** See Stage 3 data below.

**Stage 4 — Synthesize (streaming LLM).** One LLM call over
{profile + scraped markdown + keyword data} produces: a positioning statement,
3–5 themes/clusters, a starter keyword table (volume/difficulty), and a
prioritized "do this next" list. Must produce a credible strategy even when the
site has zero existing rankings — the cold-start case is the _default_ for the
indie-founder ICP, not an edge case.

**Stage 5 — Persist + gate.** Save as the Project Context artifact (markdown,
MCP-readable). Present the full strategy free; the paywall lands on _executing_
it.

## Stage 3 data (v1 — kept minimal)

Stage 3 is **archetype-conditional**: detect the site type cheaply, then frame
the goal accordingly. For v1 the archetype branches the _narrative_, not a large
matrix of API calls. Two calls baseline:

| Call                   | Endpoint                                               | Purpose                                              | When                                                                 |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `domain_rank_overview` | `/v3/dataforseo_labs/google/domain_rank_overview/live` | traffic + # ranking keywords; the archetype detector | always                                                               |
| `keyword_ideas`        | `/v3/dataforseo_labs/google/keyword_ideas/live`        | starter keyword list, seeded from scraped themes     | always                                                               |
| `ranked_keywords`      | `/v3/dataforseo_labs/google/ranked_keywords/live`      | what they already rank for                           | only if overview shows real rankings (usually skipped for new sites) |

Archetypes (narrative only in v1): **new/pre-traffic**, **established content
site**, **local business**, **SaaS/product** (core ICP).

**Clarifying question:** for **beginners**, skip it and use the archetype's
default goal (fewer decisions = less drop-off). For **non-beginners**, ask one
targeted question after detection to confirm intent (e.g. "grow existing
rankings, or expand into new topics?") — agency without a survey.

**Deferred to v2:** `serp_competitors`, local-business tools
(`get_local_serp_results`, `search_local_businesses`,
`get_google_business_questions`), and Google Ads volume for non-Labs countries.

## Cost per free onboarding

The whole run is free (paywall is after), so cost-per-signup must be bounded:

- DataForSEO: ~$0.04–0.08 (2 Labs live calls; metered from the real `cost`
  field in the response envelope, so we can hard-cap).
- Browser Rendering scrape: ~negligible.
- LLM synthesis: ~$0.05–0.15 (one call over a few pages of markdown).
- **Total ≈ $0.10–0.25 per onboarding.**

Guardrails: one run per user, results cached hard, and **email verification
gates Stage 3** (the DataForSEO spend) to kill drive-by abuse.

## Project Context artifact (MCP-readable)

The strategy is stored as a **markdown document** — a living "Project Context"
that is the shared source of truth across the in-app agent, the web UI, and any
MCP client.

- Storage: a `project_context` row in D1 (`projectId`, `markdown`, `updatedAt`,
  `version`). Small enough for D1; R2 only if it grows.
- MCP: a `get_project_context` tool (and ideally an MCP _resource_ so it
  auto-loads into the agent's context). The user's own Claude/Codex reads the
  same strategy the app shows.
- The onboarding agent **authors** the context; the paid execution actions
  (rank tracking, briefs, coach) **read from and append to** it. That append-back
  is the natural shape of the gated surface.

## Project defaults (country/language)

Projects don't currently store a default location — only `rank_tracking_configs`
does (defaults 2840/US, "en"). Add `location_code` + `language_code` to
`projects`, set from the Stage 0 country, and reuse them everywhere project work
needs a location. A small curated country → `location_code` map is enough for
v1.

## Paywall

Free: the full strategy, positioning, themes, capped starter keyword list
(~15–20), and the "do next" list. Gated (execution): rank-tracking the proposed
keywords, full keyword expansion, content briefs per theme, and the ongoing
`seo-coach`. Every gated action is a named thing tied to a strategy item the
user already believes in — stronger pull than "refine further." GSC stays behind
the gate; we do **not** prompt for it during onboarding (connecting then hitting
a paywall is exactly the bait-and-switch the UX audit warned against).

## Unify the seo-coach skill

Update the `seo-coach` skill (and `onboarding-checklist`) so the coach and the
onboarding agent are one continuous experience: the coach reads Project Context
via MCP, picks up where onboarding left off ("here's your strategy — let's work
the backlog"), and can answer both SEO questions and OpenSEO product questions.
The onboarding agent sets the backlog; the coach executes it.

## Open questions

- Country → `location_code` source: hand-curate a short list for v1, or reuse an
  existing DataForSEO locations dataset?
- Re-run policy: confirmed one strategy per project, regenerate in place; new
  domain = new project (a soft upgrade nudge).
- Synthesis model choice (cost vs quality) — decide at technical design.

## Out of scope for v1

Conversational/iterative agent loop, competitor and local-business analysis,
GSC-enriched strategy, multi-language strategies, automatic content generation.
These are incremental improvements once the core activation loop is proven.
