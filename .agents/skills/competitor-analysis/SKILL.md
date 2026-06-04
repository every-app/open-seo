---
name: competitor-analysis
description: "Analyze one competitor's organic footprint, ranking keywords, content themes, backlinks, and gaps."
---

# OpenSEO Competitor Analysis

## Goal

Analyze one competitor deeply enough to decide what to learn from, avoid, counter-position against, or outrank.

Use this for a named competitor. For identifying the market leaders first, use `competitive-landscape`.

## Required inputs

- `projectId`
- Competitor domain
- User's domain when comparison is requested
- Optional topic/category/location/language

## OpenSEO MCP tools

- `get_domain_overview`: baseline organic traffic and keyword count.
- `get_search_console_performance`: when comparing to the user's own domain and Search Console is connected, use it as the first-party baseline (real clicks/impressions/CTR/position) instead of estimating the user's own performance from third-party data.
- `get_ranked_keywords`: exact keyword, URL, rank, intent, traffic, CPC, and SERP-type rows for the competitor domain or page.
- `get_backlinks_overview`: backlink/referring-domain profile.
- `find_serp_competitors`: validate whether the named competitor is a real search competitor across the target keyword set.
- `search_local_businesses`, `get_local_serp_results`, and `get_google_business_questions`: use for local SEO competitors when Maps/local-pack visibility, nearby businesses, categories, or Google Q&A matter.
- `get_serp_results`: validate direct head-to-head SERPs for important keywords.
- `research_keywords`: expand gaps or category terms when needed.

## Workflow

1. Call `get_domain_overview` for the competitor, passing provided location/language when supported.
2. If comparing to the user, call `get_domain_overview` for the user's domain too — and if Search Console is connected, `get_search_console_performance` for the user's real baseline.
3. Call `get_ranked_keywords` for the competitor. Use filters like `maxRank`, `minSearchVolume`, `excludeBrandTerms`, and `resultTypes` to keep rows relevant.
4. If comparing to the user, call `get_ranked_keywords` for the user's domain/page too, or use `get_serp_results` for the shared terms when a lighter check is enough.
5. For local SEO, use `search_local_businesses` and `get_local_serp_results` around the relevant business location(s) before drawing local-pack conclusions. Add `get_google_business_questions` only when Q&A evidence matters.
6. Use `find_serp_competitors` when the competitor was supplied by the user but its search overlap is unclear.
7. Group competitor keywords into themes:
   - Product/category terms
   - Alternatives/comparisons
   - Templates/tools/calculators
   - Educational guides
   - Branded demand
   - Local/neighborhood terms when relevant
8. Call `get_backlinks_overview` for the competitor, especially if authority appears to explain rankings. Continue without backlink evidence if it is unavailable.
9. Use `get_serp_results` for important shared or target keywords to compare positioning, passing provided location/language when supported.
10. Produce an actionable plan:
    - What they are doing well
    - Where they are vulnerable
    - Which pages/keywords to pursue
    - What to avoid copying

## Output format

Start with:

- Competitor snapshot
- Biggest lesson
- Best opportunity to beat them

Then include:

| Area | Competitor pattern | Evidence | OpenSEO opportunity |
| ---- | ------------------ | -------- | ------------------- |

Include sections for:

- Top keyword themes
- Content/page types working for them
- Backlink/authority notes
- Head-to-head SERP observations
- Priority actions for the user

## Guardrails

- Do not treat all competitor keywords as desirable. Filter for business fit.
- Separate evidence from inference.
- Do not infer competitor page/content-type patterns from keyword rows alone; use SERP or web evidence for page-level claims.
- For local SEO, do not infer Maps/local-pack strength from national organic domain metrics alone; use local business and local SERP tools when the location is known or reasonably discoverable.
- Do not recommend copying content; recommend a stronger angle or better answer to the same intent.
- If the user's domain is unavailable, frame the analysis as competitor-only.
