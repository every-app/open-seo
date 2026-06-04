---
name: competitive-landscape
description: Map SEO market leaders, winning content themes, keyword coverage, backlinks, and strategic gaps.
---

# OpenSEO Competitive Landscape

## Goal

Answer: "Who is winning this SEO market, what content is working for them, and where are the openings?"

Use this when the user wants a market-level view across several competitors. For a deep dive on one domain, use `competitor-analysis`.

## Required inputs

- `projectId`
- Topic, seed keywords, market/category, or user's domain
- Optional known competitors
- Optional location/language

## OpenSEO MCP tools

- `research_keywords`: discover representative market queries.
- `get_keyword_metrics`: validate known query sets with volume, difficulty, intent, and trends.
- `get_serp_results`: identify recurring ranking domains across target queries.
- `find_serp_competitors`: compare domains competing across supplied keywords; use this before manual SERP counting when a keyword set is available.
- `get_domain_overview`: size organic footprint for candidate leaders.
- `get_search_console_performance`: when the user's own domain is in the comparison and Search Console is connected, anchor their position with first-party clicks/impressions/CTR rather than third-party estimates.
- `get_ranked_keywords`: find exact ranking keywords, URLs, ranks, intents, and SERP result types for leaders.
- `get_backlinks_overview`: compare backlink/referring-domain strength where relevant.
- `search_local_businesses`, `get_local_serp_results`, and `get_google_business_questions`: use for local SEO markets where proximity, Maps rankings, business categories, reviews, or Google Q&A affect who is winning.

## Workflow

1. Define the market query set:
   - Use provided keywords, or call `research_keywords` to build 5-10 representative queries.
   - Include mixed intent: informational, commercial, comparison, and tool/software terms when applicable.
   - For local SEO, include neighborhood/city/service-area queries and identify the priority locations or coordinates.
2. If the query set is already known, use `get_keyword_metrics` to validate relative demand and difficulty and `find_serp_competitors` to identify recurring domains at scale.
3. For local SEO, call `search_local_businesses` and `get_local_serp_results` for the highest-priority location(s) before synthesizing winners. Use `get_serp_results` as a complement for organic pages, not as the only local evidence.
4. Call `get_serp_results` for representative queries when live SERP composition, ranking URLs, or SERP features need inspection. Send at most 10 queries per call.
5. Identify recurring domains and group them by type:
   - Direct product competitors
   - Publishers/media
   - Marketplaces/directories
   - Communities/forums
   - Documentation/resources
6. For the strongest recurring domains, call `get_domain_overview`; default to the top 3-5 domains before expanding.
7. For direct competitors and relevant publishers, call `get_ranked_keywords`.
8. Use `get_backlinks_overview` when backlink authority appears important or the user asks why a domain is winning. Backlinks may be unavailable if the account has not enabled that data; continue with SERP/domain evidence if it fails.
9. Synthesize patterns: content types, themes, SERP formats, local-pack signals, authority advantages, and underserved angles.

## Output format

Start with the market read:

- Market leaders
- Most winnable opportunity area
- Biggest barrier to ranking

Then include:

| Domain | Type | Why they matter | Organic footprint | Winning themes | Weakness/gap |
| ------ | ---- | --------------- | ----------------- | -------------- | ------------ |

Add:

- Query set used
- Content formats that are working
- Keyword/theme gaps
- Backlink or authority observations
- Recommended next workflows: competitor analysis, keyword clustering, or content brief

## Guardrails

- Distinguish SEO competitors from business competitors.
- Do not overstate exact traffic when OpenSEO returns estimates.
- If using a small query set, call the result directional.
- Do not assume a publisher is a product competitor; label domain types clearly.
- For local markets, distinguish organic-page winners from Maps/local-pack winners.
