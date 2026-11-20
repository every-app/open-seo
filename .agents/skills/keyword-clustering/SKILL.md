---
name: keyword-clustering
description: Cluster keywords by intent and map them to existing or proposed pages.
---

# OpenSEO Keyword Clustering

## Goal

Group keywords into page-level clusters and decide which existing or new page should target each cluster. This is a keyword mapping workflow, not just a semantic grouping exercise.

## Required inputs

- `projectId`
- A keyword list, saved keyword tag, seed topic, or target domain
- Optional existing URLs/pages to map against

If keywords are not provided, use `list_saved_keywords` for saved sets, `research_keywords` for seed discovery, or `get_ranked_keywords` when the user starts from a target domain.

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the mapping in it — the saved key pages are the existing pages clusters should map to, and the business and goal decide which clusters are worth targeting.
2. This skill needs key pages. If none are saved, run a minimal inline setup: ask the user for the pages that matter, or propose a shortlist from the site, an audit, or Search Console and confirm it, write it back with `update_project_context` (`addKeyPages`), then continue the clustering. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same research ran within the last 30 days, reuse that result and say so instead of re-buying it.
4. On finish, write back what is durable with `update_project_context` — new or corrected `addKeyPages` entries with the topic each page now targets — and append a research log entry: `{ appendResearchLog: { summary: "Keyword clustering: <keyword set>. Verdict: <conclusion>" } }`.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "keyword-clustering"`. If that skill is not available, say so and stop before writing HTML.

## OpenSEO MCP tools

- `list_saved_keywords`: fetch an existing keyword set, optionally filtered by tags.
- `research_keywords`: expand a seed when the user starts from a topic.
- `get_ranked_keywords`: gather exact ranking keywords and URLs when the user starts from a domain or page.
- `get_search_console_performance`: when Search Console is connected, pull real queries with `dimensions: ["query","page"]` to map terms to the pages already earning impressions and to surface cannibalization (one query splitting clicks across multiple URLs).
- `get_serp_results`: validate whether keywords belong on the same page by checking SERP overlap and intent.
- `get_local_serp_results`: use for local SEO clusters when Maps/local-pack intent should affect page mapping.
- `save_keywords`: optionally tag final clusters after user confirmation.

## Workflow

1. Gather the candidate keyword set.
   - Use `get_search_console_performance` (dimensions `["query","page"]`) when Search Console is connected to start from real queries and the pages already ranking for them.
   - Use `get_ranked_keywords` for domain/page-driven clustering.
   - Use `search_local_businesses` and `get_local_serp_results` when proximity, local packs, or Google Business results determine whether terms belong on location pages.
2. Remove duplicates, irrelevant terms, and terms that clearly require a different product or audience.
3. Build clusters around intent and page type:
   - Same SERP intent and similar ranking pages belong together.
   - Different intent, buyer stage, or SERP format should be split.
   - Similar words do not guarantee the same cluster.
4. For important borderline terms, use a small `get_serp_results` batch to check overlap.
5. Assign each cluster to:
   - Existing URL, if supplied and appropriate
   - New page recommendation, if no existing page fits
   - Do-not-target / later bucket, if weak or off-strategy
6. Identify cannibalization risk when multiple pages would target the same intent. When Search Console is connected, confirm it from real data with `get_search_console_performance` (`dimensions: ["query","page"]`) — the same query sending impressions to multiple URLs.
7. Ask before applying cluster tags with `save_keywords`.

## Output format

Title: "Keyword clustering" and the keyword set, such as "Keyword clustering: invoicing keywords". A map of the whole site's keywords is just "Keyword clustering".

If a report template applies (see `seo-report`), its sections and tone replace this list.

Use the report shape in `seo-report`: the verdict, "What to do", the moves, then the data. For a cluster map:

1. **Verdict**: how many clusters, how many pages to create and how many to update, which comes first, and any cannibalization found.
2. **The moves**: the three highest-priority pages, each a page brief.
   - **Facts**: the cluster's estimated monthly demand, how many keywords it holds, and "New page" or the existing URL to update.
   - **Do this**: the page to create or update, a draft title on the primary keyword, the required sections nested under one step, and the pages to link from nested under another.
   - **Why**: the searcher's problem, and the SERP evidence that these keywords belong on one page.
3. **The cluster map**: one table of every cluster: Cluster | Primary keyword | Intent | Target page | Priority. The moves are the `pick` rows. Keep secondary keywords out of this table.
4. **The other pages**: one `h3` per remaining cluster in priority order, each a short list: the page to create or update, its sections, its secondary keywords.
5. **Cannibalization**: a table of the query, the competing URLs, and which one to keep, only when there is real evidence for it.
6. **How this report was made**: opens with the skill link line from `seo-report`, pointing at `https://openseo.so/docs/skills/keyword-clustering` ("OpenSEO Keyword Clustering skill"), then where the keywords came from, and a note labelling target pages as proposed when no URL data was supplied.

Suggest the tags and ask before applying them in chat after the link. The report does not carry questions.

## Guardrails

- Do not over-cluster tiny keyword sets. If there are fewer than 10 usable terms, produce a simple map.
- Do not rely on lexical similarity alone. SERP intent wins.
- Do not replace tags broadly without explicit confirmation.
- If existing URL data is missing, label target pages as proposed.
