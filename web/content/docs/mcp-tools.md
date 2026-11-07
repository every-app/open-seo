---
title: "OpenSEO MCP tools"
description: "Everything your agent can do through OpenSEO MCP, and which tools use credits."
---

OpenSEO MCP exposes tools for SEO research workflows:

- Research keywords with volume, difficulty, and CPC.
- Fetch live Google organic SERP results for keywords.
- Find exact keyword, page, rank, volume, CPC, intent, and traffic rows for a domain or page.
- Compare SERP competitors across a supplied keyword set.
- Search local businesses near a coordinate, filtering by rating, review count, or claimed status.
- Fetch one Maps or Local Finder SERP, and read Google Business Q&A when needed.
- Audit a Google Business Profile: categories, rating, hours, photos, and claim status.
- Collect Google reviews (including reviews from other sites) and Google Business posts.
- Look up valid Google Business category slugs.
- Check Google Maps rank at each point of a grid around a business.
- Hydrate keywords with search volume, difficulty, intent, CPC, and trends.
- List saved keywords from an OpenSEO project.
- Save useful keywords back to OpenSEO.
- Create and run rank trackers, add or remove keywords, and read the latest positions and rank history. Estimating a check's cost is free; running one uses credits.
- Summarize a domain's organic footprint.
- Find keywords a domain already ranks for.
- Check backlink and referring-domain overview data.
- Explore a prompt in ChatGPT or compare answers and available citations across selected AI models. ChatGPT is the default; uncached answers use credits.
- Research questions about a keyword with ChatGPT's answers and cited sources (uses credits).
- Configure AI prompt tracking, preview cost, and start or pause scheduled checks.
- Read and export saved AI answers, trends, citations, and competitor appearances without using credits.
- List the Search Console sites and Google Analytics properties your connected Google accounts can see, and bind one to a project (free, no credits). Connecting a Google account itself still happens in Settings > Integrations.
- Read first-party Google Search Console performance (clicks, impressions, CTR, position).
- Inspect index status, crawl, and canonical for specific URLs (up to 10 per call).
- Tell Bing and other IndexNow search engines which pages on your site were added, changed, or removed (free, no credits). Your site hosts the project's key file, shown in Settings > Integrations. Google doesn't use IndexNow.
- Read and update a project's shared context: business, goal, positioning, writing preferences, competitors, key pages, and a research log (free, no credits).
- Save and read HTML reports on a project (free, no credits). New reports are private. On hosted OpenSEO, explicitly ask the agent to publish with `set_report_sharing` (`public: true`) or revoke the link (`public: false`). `get_report` returns `report.shareUrl` for an existing public link, or `null` when unavailable.
- List a project's report templates, and save a reusable report brief to the project (free, no credits).

To connect an agent, see [Set up OpenSEO MCP](/docs/mcp).
