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

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "local-seo"`. If that skill is not available, say so and stop before writing HTML.

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
6. Run `get_local_rank_grid` for the main keyword, and for each further keyword the user gave (same grid, same center; state the cost first). Use the grid to separate "ranks at the storefront only" from "ranks across the service area", and each point's `topResult` to name who wins where the target doesn't.
7. Add `get_google_business_questions` and `get_business_updates` when the profile basics are already competitive and the gap is engagement rather than setup.
8. Turn the evidence into a prioritized list. Category and claim problems outrank posting cadence every time.

### Multi-location businesses

Always build the profile snapshot table for the whole chain — one `search_local_businesses` call covers it. The per-location deep-dives (reviews, grid, posts, Q&A) are where cost scales:

- 5 locations or fewer: deep-dive them all.
- More than 5: present the snapshot table, then ask the user (AskUserQuestion) which 1-3 locations to deep-dive. Pick sensible defaults to recommend — e.g. the weakest profile in the densest market.

## Output format

`h1`: the business name.

If a report template applies (see `seo-report`), its sections and tone replace this list.

Sections in this order:

1. **Snapshot** — one or two opening sentences, then a table of category, rating, review count, and claimed status. One row per location for a chain.
2. **The one fix** — one finding. Category and claim problems outrank posting cadence every time.
3. **Head to head** — a table of signal, this business, the best competitor, and the gap. Cover categories, reviews (count, recency, owner replies), hours and profile completeness, and the listing's website link.
4. **Maps coverage** — the grid drawn as described in "Drawing the grid" below, its four stat blocks, then what it shows: where visibility drops off, in which direction, and who wins there.
5. **Q&A and posting** — only when the basics are already competitive.
6. **What to do next** — an ordered list.
7. **How this report was made** — opens with the skill link line from `seo-report`, pointing at `https://openseo.so/docs/skills/local-seo` ("OpenSEO Local SEO skill"), then which tools returned what, plus a note reading each missing grid rank against that point's `resultsCount` rather than calling it invisibility.

## Drawing the grid

Local rank trackers (SE Ranking, Local Falcon, BrightLocal) all draw the same picture: numbered circles laid out as the grid, colored by position, with the storefront marked. Reproduce that picture so readers who know those tools recognize it. The figure carries two things: the grid's data, which the viewer draws as a live Google Map, and an inline SVG drawing of the same grid, which readers see in print, in an exported PDF, and wherever the map cannot load.

**Value per point.** With one keyword, the rank. With several keywords, the average position across them as a decimal with one place (3.5), the way SE Ranking collapses many keywords into one map. A keyword that searched a point and did not find the business (`rank` null, no `error`) counts as 21 in that point's average, so ranks 1 and not found average 11.0. A value over 20 prints as "20+", which only happens when no keyword found the business there. A keyword whose search failed at a point (`error: true`) has no position there: leave it out of that point's value and out of every stat below.

**Color scale.** Fixed, never restyled per report:

| Value     | Fill      | Number  |
| --------- | --------- | ------- |
| 1–3       | `#3F9D4E` | white   |
| over 3–5  | `#8BC34A` | white   |
| over 5–7  | `#F2C94C` | `#2A1E05` |
| over 7–10 | `#F28C28` | white   |
| over 10–15 | `#E23B3B` | white  |
| over 15–20 | `#A31515` | white  |
| not found | `#A3ADB8` | white   |

**The SVG.** North up, west left, one circle per grid point on a 120-unit pitch with radius 22, so a 3x3 uses `viewBox="0 0 360 400"` and a 5x5 `viewBox="0 0 600 640"`. Set `width` to 360 for a 3x3 and 480 for a 5x5 so the drawing does not stretch to the column; the template already caps it at 100% on a phone. Print the value inside each circle (bold, 15px, centered with `text-anchor="middle"` and `dominant-baseline="central"`). Give the storefront circle a second ring: the same circle again with `fill="none"`, a 2px dark stroke, radius 27. Add an "N" label above the top row and the spacing under the bottom row ("2 km between points"). Then a `figcaption` that lists every value as text in reading order, because a chart never carries a number that is not also written out. First row of a 3x3, for the agent to repeat:

```html
<svg viewBox="0 0 360 400" width="360" role="img" aria-label="Rank grid, 3 by 3, 2 km spacing">
<text x="180" y="18" text-anchor="middle" font-size="12" fill="#8f8f8f">N</text>
<circle cx="60" cy="80" r="22" fill="#3F9D4E"/><text x="60" y="80" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="700" fill="#fff">3.0</text>
<circle cx="180" cy="80" r="22" fill="#8BC34A"/><text x="180" y="80" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="700" fill="#fff">3.5</text>
<circle cx="300" cy="80" r="22" fill="#8BC34A"/><text x="300" y="80" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="700" fill="#fff">3.5</text>
<!-- rows 2 and 3 at cy 200 and 320; the storefront (cx 180, cy 200) also gets: -->
<circle cx="180" cy="200" r="27" fill="none" stroke="#0a0a0a" stroke-width="2"/>
<text x="180" y="372" text-anchor="middle" font-size="12" fill="#8f8f8f">2 km between points</text>
</svg>
```

The `figcaption` lists every value in reading order: "Average position across 2 keywords. NW 3.0, N 3.5, NE 3.5, W 3.0, storefront 1.5, E 3.5, SW 4.5, S 4.5, SE 3.5."

**Four stat blocks** beside or under the drawing, each a heading and a number or short list:

1. Avg. position: the mean of the point values, two decimals.
2. Rankings distribution: how many point values are 3 or better, over 3 to 10, over 10 to 20, and 20+, as a `.bars` chart.
3. Avg. position per keyword: one row per keyword with its mean and how many of its points were top 3.
4. Who ranks #1 most often: count each point's `topResult` across all keywords and list businesses by share.

**Reading it.** Say where visibility drops off by compass direction and by distance ("2 km south, around 75th St" when the user has given you a landmark; otherwise the direction alone), and name who wins there from `topResult`. Proximity to a rival's storefront explains most drop-offs; say so when the rival's coordinate confirms it.

**The figure.** Always wrap the drawing in a widget figure. The viewer renders it as a live Google Map fitted to the grid, with a keyword filter and a popup per point, and hides the SVG while the map is showing:

```html
<figure data-widget="rank-grid">
<script type="application/json">{"spacingKm":1,"keywords":[{"keyword":"italian restaurant","points":[{"row":0,"col":0,"lat":41.7918,"lng":-88.1714,"rank":3,"top":"La Sorella di Francesca"}]}]}</script>
<svg …the drawing above…</svg>
<figcaption>…</figcaption>
</figure>
```

Every point the tool returned goes in `points`: its `row` and `col`, `latitude` as `lat`, `longitude` as `lng`, `rank` (`null` when the business was not found there) and `topResult.title` as `top`. Leave out a point whose search failed (`error: true`); the viewer shows that keyword as "search failed" there. One entry in `keywords` per grid you ran, all with the same center and spacing. The block is data: no comments, no trailing commas, nothing computed.

## Guardrails

- Do not run a 5x5 grid, or grids for several keywords, without telling the user the cost first — every point is a paid SERP call.
- Match businesses by `cid` or `place_id` when you have one. Name matching collides with chains and similarly named businesses.
- A missing rank at a grid point means the business wasn't among the results returned there. Read it with that point's `resultsCount`: a full result set means outranked; a near-empty one means a sparse SERP, not proof of invisibility.
- Do not infer local-pack strength from national organic metrics.
- Never recommend review gating, fake reviews, or keyword-stuffed business names.
- A grid centered on the wrong place is worse than no grid — confirm the coordinate matches the storefront before spending grid credits.
