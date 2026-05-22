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
- `get_domain_keyword_suggestions`: top ranking keywords and keyword themes.
- `get_backlinks_overview`: backlink/referring-domain profile.
- `get_serp_results`: validate direct head-to-head SERPs for important keywords.
- `research_keywords`: expand gaps or category terms when needed.

## Workflow

1. Call `get_domain_overview` for the competitor, passing provided location/language when supported.
2. If comparing to the user, call `get_domain_overview` for the user's domain too.
3. Call `get_domain_keyword_suggestions` for the competitor, passing provided location/language when supported.
4. Group competitor keywords into themes:
   - Product/category terms
   - Alternatives/comparisons
   - Templates/tools/calculators
   - Educational guides
   - Branded demand
5. Call `get_backlinks_overview` for the competitor, especially if authority appears to explain rankings. Continue without backlink evidence if it is unavailable.
6. Use `get_serp_results` for important shared or target keywords to compare positioning, passing provided location/language when supported.
7. Produce an actionable plan:
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
- Do not recommend copying content; recommend a stronger angle or better answer to the same intent.
- If the user's domain is unavailable, frame the analysis as competitor-only.
