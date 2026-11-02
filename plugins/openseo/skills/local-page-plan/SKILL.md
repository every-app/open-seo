---
name: local-page-plan
description: "Decide which local service pages and service-area pages to build or optimize first from local keyword demand, Search Console, and Google Analytics."
---

# OpenSEO Local Page Plan

## Goal

Decide which service pages and service-area pages a local home-service business should publish or improve first. The result is an ordered page plan for paths shaped like `/services/<slug>/` and `/service-areas/<slug>/`.

This is a prioritization workflow. It does not write the website, audit a Google Business Profile, or forecast a Maps rank or a date.

Use `keyword-research` when the user wants a keyword list. Use `keyword-clustering` when they already have keywords and want clusters. Use `local-seo` when the question is Maps visibility around a storefront.

## Required inputs

- `projectId`
- The trade and the services the business actually performs
- The cities the business will drive to, and which city is primary
- Optional: the live domain, when one exists

If a service or city is missing, ask once. Confirm the list before any paid call. Keyword ideas do not add a service the business does not perform. Search volume does not add a city the business will not drive to.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the plan in it — the business, the markets, and any key pages already saved.
2. This skill needs `business_overview` with the services and the cities. If it is empty, run a minimal inline setup: ask, or infer from the site and confirm, write it back with `update_project_context`, then continue. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same seeds and locations ran within the last 30 days, reuse that result and say so.
4. On finish, write proposed build-now paths with `update_project_context` (`addKeyPages`, role `money`, notes `proposed` until the URL is live) and append a research log entry: `{ appendResearchLog: { summary: "Local page plan: <services/cities>. Verdict: <conclusion>" } }`.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "local-page-plan"`. If that skill is not available, say so and stop before writing HTML.

## OpenSEO MCP tools

- `search_serp_locations`: resolve each confirmed city. Pass the returned `locationName` verbatim on later keyword calls.
- `get_search_console_performance`: when Search Console is connected. Striking distance uses `minPosition: 5`, `maxPosition: 20`, `minImpressions: 50`. The query-to-page map uses `dimensions: ["query","page"]`. Free. A not-connected result is a coverage gap; continue without it.
- `get_google_analytics_organic_landing_pages`: organic sessions, engagement, and key events by landing page. Free. No extra inputs.
- `get_google_analytics_key_events`: pass `breakdown: "event_and_landing_page"`. Free. A not-connected result is a coverage gap; continue without it.
- `research_keywords`: 1–5 seeds per call. Leave `resultLimit` at the default 150. Do not set `includeClickstreamData`. For local demand, set `locationName` on each seed. Volume, CPC, and competition become local; keyword ideas, keyword difficulty, and intent stay national.
- `get_keyword_metrics`: one batch, only for exact service and city phrases and Search Console queries that the research rows did not already return. Up to 700 keywords.
- `get_serp_results`: the build-now shortlist only, with the same `locationName`, when intent is ambiguous.
- `get_local_serp_results`: at most one call, for the leading city and the primary service, and only when a local pack would change which city is first. State the cost first.
- `save_keywords`: only after explicit confirmation.

Do not call `get_local_rank_grid`. A Maps grid belongs to `local-seo`, and only after this plan has named the city worth gridding.

## Workflow

1. Resolve the project. Read context. Confirm services, cities, and the primary city in one question when they are not already confirmed.
2. When a domain exists, read Search Console and both Analytics tools before any paid call. Record "not connected" when a tool says so. A business with no site has neither source; say that and rank on keyword data only.
3. Count the paid seeds and say the count before calling `research_keywords`:
   - One seed per confirmed service, each with the primary city's `locationName`.
   - One seed per confirmed city, each the primary service with that city's `locationName`.
   - Batch at most 5 seeds per call.
   - When the total exceeds 10 seeds, run the primary city plus the services the user names as the money set (at most 4 more seeds), then ask before the rest.
4. Drop terms for services the business does not perform, brand-only queries, and duplicates.
5. Group by intent. One commercial or transactional intent becomes one service page. Symptom and price queries join that service page's FAQ and do not get their own URL. A query that names the primary service and a city supports that city's page. Other services stay on their own `/services/<slug>/` page and are linked from the city page. This plan has no `/services/<service>/<city>/` path.
6. A neighborhood stays on its city page unless it has its own local volume and the business treats it as a separate place it drives to.
7. Hydrate missing exact phrases and striking-distance queries with one `get_keyword_metrics` call.
8. Spot-check SERPs only for rows that might be build now. Use one local-pack lookup only when the tool list above allows it.
9. Assign each candidate using the decisions below.
10. Present the plan and ask before `save_keywords`. Suggest tags `topic:<service>` and `page:/services/<slug>/` or `page:/service-areas/<slug>/`.

## Decisions

Compare candidates only inside this business's confirmed set. A missing metric is `unknown`. Unknown is not zero, and it does not outrank a known weaker term.

**Build now — service.** The business performs it. Intent is commercial or transactional (hire, repair, replace, install). Local volume is in the stronger half of this service set, or the business named it as a primary money service and volume is unknown. Keyword difficulty is outside the hardest band of this set, or Search Console already shows the query at position 5–20 with at least 50 impressions. A checked SERP is local service pages or a local pack. A SERP of retailers, manufacturers, or DIY publishers is not a service page.

**Build now — city.** The business will drive there. Local volume for the primary service in that city is in the stronger half of the confirmed cities. Keyword difficulty is in the easier half of that city list, or Search Console already shows the city query in striking distance. Publish the first row first. This order is comparative. It is not a rank position and not a time-to-rank.

**Optimize first.** Use this only when Search Console or Analytics returned rows and a URL already earns the query. Position 5–20 with at least 50 impressions means improve that page before creating a new one. Organic sessions with a weaker key-event rate than the business's other service or city pages mean the gap is the page, so improve the offer and the call to action. Key events concentrated on one service page mean strengthen that page before opening another city. The same query sending impressions to two URLs means keep the specific service or city URL.

**Later.** The business offers it or drives there, and volume is low or difficulty is in the hardest band, with no striking-distance impressions.

**Do not build.** The business does not sell it, the intent is informational only, the place is a neighborhood of a city page, or the intent already belongs to a page in this plan. On the site, a service with no page links to `/contact/`.

## Output format

`title` and `h1`: `Local Page Plan — MMM D, YYYY`. The byline names the business.

If a report template applies (see `seo-report`), its sections and tone replace this list.

Sections in this order:

1. **The plan** — a bullet list: how many service pages to build now, how many city pages, which city is first, and whether an existing page should be optimized before any new page. One fact per line.
2. **Service pages** — a table of page, primary keyword, local volume, keyword difficulty, and decision.
3. **Service areas** — a table of city, primary keyword, local volume, keyword difficulty, and order. The first row is the city to publish first.
4. **Why this order** — one finding each for the first service, the first city, and any optimize-first page. State the evidence (the numbers, or `unknown`), the path to create or the URL to improve, and why it comes before the next candidate. The expected effect is a hypothesis about fit inside this set. Do not name a rank position or a date.
5. **Optimize these first** — a table of URL, evidence, and action. Omit the section when Search Console and Analytics are absent.
6. **Do not build** — a short table of the term or place and the reason. Omit when empty.
7. **What to do next** — an ordered list. After the user confirms the build-now rows, draft those pages with the local-site-boilerplate skills `generate-service-page` and `generate-service-area-page`. Offer `local-seo` only if a Maps grid for the first city would change the order. Ask before saving keywords.
8. **How this report was made** — opens with the skill link line from `seo-report`, pointing at `https://openseo.so/docs/skills/local-page-plan` ("OpenSEO Local Page Plan skill"), then which tools returned what. State that keyword difficulty and intent stayed national, that local volume used `locationName`, and which sources were not connected.

Add one bar chart of local volume for the build-now shortlist when at least two volumes are known. Print every bar's number in the table too.

## Guardrails

- Do not invent a metric, a service, a city, a rank, or a date.
- Do not create website files or call `save_keywords` without confirmation.
- Do not run a rank grid, a 300 or 500 `resultLimit`, or clickstream volumes.
- Do not treat national difficulty as a Maps rank.
