---
name: local-seo
description: "Audit a Google Business Profile, compare it to local competitors, and map Maps visibility around a location."
---

# OpenSEO Local SEO

## Goal

Work out why a business does or does not show up in Google Maps and the local pack near its customers, and what to fix first.

Use this when rankings depend on a physical location or service area. For national organic work, use `competitor-analysis` or `keyword-research`.

## Required inputs

- `projectId`
- The business: name, or a `cid`/`placeId` (most reliable)
- Its coordinate (latitude/longitude) — derive it from a `search_local_businesses` / `get_local_serp_results` row; only ask the user when derivation is ambiguous
- One to three keywords customers actually search (e.g. "emergency plumber", not the brand name)

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the work in it — what the business does and where it operates decides which keywords and radius matter.
2. This skill needs `business_overview`. If it is empty, run a minimal inline setup: infer what the business does and its location from the site and confirm it with the user in one question, write it back with `update_project_context`, then continue. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same research ran within the last 30 days, reuse that result and say so instead of re-buying it.
4. On finish, write back what is durable with `update_project_context` — local competitors that have a website via `addCompetitors` (competitor rows are keyed by domain, so skip listings without one), a corrected `business_overview` — and append a research log entry: `{ appendResearchLog: { summary: "Local SEO: <business> near <area>. Verdict: <conclusion>" } }`.

## OpenSEO MCP tools

- `search_local_businesses`: nearby listings, filterable by `minRating`, `minReviews`, and `isClaimed` — use `isClaimed: false` to find unclaimed listings when prospecting. One call with the brand name as `query` and a wide radius returns category, rating, review count, claimed status, coordinates, and `cid` for every location of a chain — usually enough that per-location `get_business_profile` calls are unnecessary.
- `get_local_serp_results`: the Maps/Local Finder result set near a coordinate. The rows carry `cid` and `place_id` — collect them once and reuse them everywhere below.
- `get_business_profile`: the full profile for one business (hours, rating breakdown) when the `search_local_businesses` row isn't enough.
- `get_business_reviews`: reviews with ratings, text, and whether the owner replied. Queued: a `processing` response returns a `taskId` — call again with it after 30-60 seconds, at no extra cost.
- `get_local_rank_grid`: rank at every point of a grid around a coordinate, with each point's result count and #1 business. 3x3 is nine searches; only go to 5x5 when the service area is genuinely wide.
- `get_google_business_questions`: Q&A on the profile (accepts `cid`/`placeId`).
- `get_business_updates`: posts published on the profile, with dates.
- `list_business_categories`: valid category slugs for `search_local_businesses`.

## Workflow

1. Find the business. Given only a name or website, `search_local_businesses` (name as `query`, wide radius) locates the listing and yields its `cid` and coordinate. If it returns several locations, the business is a chain — see multi-location below.
2. Run `get_local_serp_results` for the main keyword near the business coordinate. Record the top 3-5 competitors' `cid`/`place_id` and the user's own row.
3. Compare the user's listing against the top two competitors: primary category, additional categories, review count, hours completeness, photo count, claimed status. `search_local_businesses` rows usually carry all of this; use `get_business_profile` for what they lack.
4. Sanity-check each listing's website link (`url`/`contact_url` in the rows): it should deep-link to that location's page on the project domain, not a homepage or a stale domain. For broader on-page work, hand off to `run_site_audit`.
5. Call `get_business_reviews` for the user and the strongest competitor. Look at review volume, recency, average rating, and how many reviews got an owner reply.
6. Run `get_local_rank_grid` for the main keyword. Use the grid to separate "ranks at the storefront only" from "ranks across the service area", and each point's `topResult` to name who wins where the target doesn't.
7. Add `get_google_business_questions` and `get_business_updates` when the profile basics are already competitive and the gap is engagement rather than setup.
8. Turn the evidence into a prioritized list. Category and claim problems outrank posting cadence every time.

### Multi-location businesses

Always build the profile snapshot table for the whole chain — one `search_local_businesses` call covers it. The per-location deep-dives (reviews, grid, posts, Q&A) are where cost scales:

- 5 locations or fewer: deep-dive them all.
- More than 5: present the snapshot table, then ask the user (AskUserQuestion) which 1-3 locations to deep-dive. Pick sensible defaults to recommend — e.g. the weakest profile in the densest market.

## Output format

Start with:

- Profile snapshot (category, rating, reviews, claimed) — one row per location for chains
- Where visibility drops off, per the grid
- The one fix to do this week

Then include:

| Signal | This business | Best competitor | Gap | Action |
| ------ | ------------- | --------------- | --- | ------ |

Cover: categories, reviews (count, recency, owner replies), hours and profile completeness, listing website links, Maps coverage from the grid, Q&A and posting hygiene.

## Guardrails

- Do not run a 5x5 grid, or grids for several keywords, without telling the user the cost first — every point is a paid SERP call.
- Match businesses by `cid` or `place_id` when you have one. Name matching collides with chains and similarly named businesses.
- A missing rank at a grid point means the business wasn't among the results returned there. Read it with that point's `resultsCount`: a full result set means outranked; a near-empty one means a sparse SERP, not proof of invisibility.
- Do not infer local-pack strength from national organic metrics.
- Never recommend review gating, fake reviews, or keyword-stuffed business names.
- A grid centered on the wrong place is worse than no grid — confirm the coordinate matches the storefront before spending grid credits.
