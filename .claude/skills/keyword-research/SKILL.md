---
name: keyword-research
description: "Discover keyword opportunities, evaluate metrics and SERPs, and save/tag promising terms."
---

# OpenSEO Keyword Research

## Goal

Turn seed topics into a prioritized keyword opportunity set using OpenSEO MCP data. The output should help the user decide what to target, what to save, and what to research next.

## Required inputs

- `projectId`
- One or more seed topics, products, pages, competitors, or audience problems
- Optional market/location/language

If `projectId` is missing, use `list_projects` first. If the target market/location/language is unclear and would materially affect keyword metrics, ask the user; otherwise use the MCP tool defaults.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the research in it — the business, the goal, the markets, and the competitors and key pages already saved.
2. This skill needs `business_overview` and `current_goal`. If either is empty, run a minimal inline setup: ask the user, or infer from the site and confirm, just enough to fill them, write them back with `update_project_context`, then continue the research. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same research ran within the last 30 days, reuse that result and say so instead of re-buying it.
4. On finish, write back what is durable — a sharpened `business_overview` or `current_goal`, competitors that kept appearing in the SERPs via `addCompetitors`, pages the keywords should land on via `addKeyPages` — and append a research log entry: `{ appendResearchLog: { summary: "Keyword research: <seeds/market>. Verdict: <conclusion>" } }`.

## OpenSEO MCP tools

- `research_keywords`: primary discovery tool. Use 1-5 seeds per call and prefer 150 results unless the user asks for exhaustive research.
- `get_keyword_metrics`: hydrate up to 700 known keywords with volume, keyword difficulty (KD), search intent, CPC, and monthly trends in one call. Use it to score candidate or known terms — including the Search Console striking-distance queries from step 1.
- `get_ranked_keywords`: pull exact ranking keyword rows when a target domain or page is part of the research brief.
- `get_search_console_performance`: when Search Console is connected, start from the project's real first-party demand — queries already earning impressions and near-ranking ("striking distance") terms. Request a high `rowLimit` and filter average position 5-20 client-side, since the API sorts by clicks and can't filter by position. Then hydrate those striking-distance queries with `get_keyword_metrics` to attach difficulty and intent.
- `get_serp_results`: inspect SERPs for the top candidate terms, especially when intent is ambiguous.
- `search_local_businesses`, `get_local_serp_results`, and `get_google_business_questions`: use for local SEO topics when a business/location radius matters.
- `list_saved_keywords`: avoid duplicating already-saved work or use existing tags as context.
- `save_keywords`: save selected keywords only after explicit user confirmation.

## Workflow

1. Normalize seeds into a small set of distinct research angles. If Search Console is connected for the project, first pull `get_search_console_performance` (high `rowLimit`, default lookback), filter to striking-distance positions (~5–20) client-side, and hydrate those queries with `get_keyword_metrics` to attach KD and intent. That ranked, hydrated list is your fastest opportunity set — work it before broad discovery.
2. If the request is local SEO, identify the business, location/coordinates or service area, and local categories. Use `search_local_businesses` and `get_local_serp_results` for the most important location/keyword set instead of relying only on national keyword/SERP data.
3. Call `research_keywords` for exploratory seeds. Use bulk calls when possible.
4. Use `get_keyword_metrics` to hydrate a fixed keyword list — or the striking-distance queries from step 1 — with volume, KD, and intent before prioritizing.
5. Use `get_ranked_keywords` when the user provides a domain/page and wants opportunities based on current rankings, near-misses, or competitor-owned terms.
6. Remove irrelevant, duplicate, branded-only, and off-intent terms.
7. Prioritize by practical opportunity, not volume alone:
   - Strong match to the user's product/page/topic
   - Clear search intent
   - Reasonable difficulty
   - Useful volume/CPC signal
   - SERP where the user can plausibly compete
   - For local SEO, local-pack/Maps visibility and proximity fit
8. Use `get_serp_results` for high-potential or ambiguous keywords when SERP intent would change the recommendation; keep the default check small.
9. Present a shortlist and a longer opportunity table.
10. Ask before saving keywords. When saving, suggest concise tags such as `topic:<topic>`, `intent:<intent>`, or `page:<slug>`.

## Output format

Start with the highest-signal recommendation:

- Best opportunity theme
- Top keywords to target now
- Keywords to save
- Risks or SERP caveats

Then include a compact table:

| Keyword | Intent | Volume |  KD | CPC | Priority | Notes |
| ------- | ------ | -----: | --: | --: | -------- | ----- |

End with next actions, including whether to run keyword clustering, create a content brief, or save the chosen keywords.

## Guardrails

- Do not invent metrics. If OpenSEO does not return a value, write `unknown`.
- Do not call `save_keywords` without explicit confirmation.
- Prefer business-fit and intent-fit over chasing the largest volume term.
