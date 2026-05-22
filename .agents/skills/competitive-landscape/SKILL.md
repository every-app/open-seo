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
- `get_serp_results`: identify recurring ranking domains across target queries.
- `get_domain_overview`: size organic footprint for candidate leaders.
- `get_domain_keyword_suggestions`: find what each leader ranks for.
- `get_backlinks_overview`: compare backlink/referring-domain strength where relevant.

## Workflow

1. Define the market query set:
   - Use provided keywords, or call `research_keywords` to build 5-10 representative queries.
   - Include mixed intent: informational, commercial, comparison, and tool/software terms when applicable.
2. Call `get_serp_results` for the representative queries. Send at most 10 queries per call.
3. Identify recurring domains and group them by type:
   - Direct product competitors
   - Publishers/media
   - Marketplaces/directories
   - Communities/forums
   - Documentation/resources
4. For the strongest recurring domains, call `get_domain_overview`; default to the top 3-5 domains before expanding.
5. For direct competitors and relevant publishers, call `get_domain_keyword_suggestions`; default to the top 3-5 domains before expanding.
6. Use `get_backlinks_overview` when backlink authority appears important or the user asks why a domain is winning. Backlinks may be unavailable if the account has not enabled that data; continue with SERP/domain evidence if it fails.
7. Synthesize patterns: content types, themes, SERP formats, authority advantages, and underserved angles.

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
