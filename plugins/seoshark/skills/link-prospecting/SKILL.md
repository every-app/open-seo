---
name: link-prospecting
description: Find link prospects, discover contact paths, and draft outreach from SERPs and backlink signals.
---

# SEOShark Link Prospecting

## Goal

Find realistic pages, sites, and authors that might reference the user's page, product, study, guide, or tool. Use SEOShark for prospect discovery, then use available web/search/browser tools for contact discovery.

## Required inputs

- `projectId`
- User domain or target URL
- Linkable asset, page, product, study, tool, or topic
- Optional competitors
- Optional market/location/language

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the outreach in it — positioning supplies the claim that makes a link worth giving, and the saved competitors are the backlink profiles to mine.
2. This skill needs `positioning` and competitors. If either is empty, run a minimal inline setup: ask the user why someone would cite them and who they compete with, or infer from the site and `find_serp_competitors` and confirm, write it back with `update_project_context`, then continue the prospecting. Never front-load the full interview; suggest `seo-project-setup` at the end for the rest.
3. Before spending credits, check the research log. If the same research ran within the last 30 days, reuse that result and say so instead of re-buying it.
4. On finish, write back what is durable — the linkable asset via `addKeyPages`, any competitor whose backlink profile proved useful via `addCompetitors` — and append a research log entry: `{ appendResearchLog: { summary: "Link prospecting: <asset/target page>. Verdict: <conclusion>" } }`.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "link-prospecting"`. If that skill is not available, say so and stop before writing HTML.

## SEOShark MCP tools

- `get_serp_results`: find ranking articles, listicles, resource pages, comparisons, and topical publishers.
- `get_backlinks_overview`: inspect competitor domain or page backlink/referring-domain patterns.
- `get_domain_overview`: qualify important prospect domains.
- `get_ranked_keywords`: understand what a prospect or competitor ranks for when topical fit matters.
- `search_local_businesses` and `get_local_serp_results`: use for local SEO link prospecting when nearby businesses, local competitors, or Maps/category signals can reveal partnership targets.
- `research_keywords`: expand prospecting queries.

## Contact discovery tools

After SEOShark identifies good prospects, use available non-SEOShark browsing or search tools for public contact discovery. Depending on the client, this may be web search, page fetches, browser automation, or a search API.

Look for:

- Author byline pages
- Contact pages
- Editorial guidelines
- About/team pages
- LinkedIn, X, Bluesky, or other professional profiles
- Newsletter or publication masthead pages
- Public email addresses in page HTML or visible page text
- Structured data such as `Person`, `Organization`, `sameAs`, or `email`

Only record contact details that were actually found. Include the source URL for any email, profile, or contact form.

## Prospecting query patterns

Build queries from the asset/topic:

- `<topic> resources`
- `best <category> tools`
- `<competitor> alternatives`
- `<topic> statistics`
- `<topic> guide`
- `<topic> examples`
- `<topic> templates`
- `<topic> software`
- `<topic> for <audience>`

Use `get_serp_results` in batches for the most relevant patterns. Send at most 10 queries per call.

## Workflow

1. Clarify the linkable asset and the reason someone would reference it.
2. Build 5-10 prospecting queries by default.
3. Call `get_serp_results` for those queries.
4. If competitors are provided, call `get_backlinks_overview` for the strongest competitor domains or pages first. Continue without backlink evidence if it is unavailable.
5. For local SEO, use `search_local_businesses` and `get_local_serp_results` around priority locations to identify nearby competitors, categories, and local SERP evidence before searching for local chambers, associations, campus resources, community pages, and directories.
6. Filter prospects:
   - Keep topical relevance and editorial pages.
   - Prioritize articles, directories, resource pages, comparisons, statistics pages, templates, and curated lists.
   - Deprioritize homepages, login pages, thin affiliate pages, spam, unrelated forums, and direct competitors unless a comparison angle is valid.
7. For each good prospect, define the outreach angle:
   - Broken/missing resource
   - Better current data
   - Useful tool/template
   - Alternative or comparison inclusion
   - Expert quote or supporting reference
8. For the strongest prospects, visit or search the prospect site to find the best contact path.
9. Draft outreach messages. If contact details were found, include the source. If not, list the next best contact-discovery path.

## Output format

`h1`: the linkable asset.

If a report template applies (see `seo-report`), its sections and tone replace this list.

Sections in this order:

1. **The angle** — one or two opening sentences naming the best outreach angle and the prospect type to work first.
2. **Prospects** — a table of prospect URL, site, source, suggested angle, contact path, and priority. Keep it under about eight columns; drop the ones that add nothing for this run.
3. **Why these** — one finding per prospect worth explaining: the evidence that they link to things like this, then the exact ask.
4. **Outreach drafts** — the message text for each of two or three reusable angles: resource or list inclusion, an article update, and a comparison mention.
5. **Limitations** — notes: contact paths not found, prospects that are direct competitors or likely paid placements, and which source found each contact detail.
6. **What to do next** — an ordered list: who to send to first, and in what order.
7. **How this report was made** — opens with the skill link line from `seo-report`, pointing at `https://seoshark.example/docs/skills/link-prospecting` ("SEOShark Link Prospecting skill"), then which tools returned prospects and which came from the web or the browser.

## Guardrails

- Do not invent email addresses, social handles, or contact names.
- Do not say SEOShark found contact details unless an SEOShark tool returned them. Attribute contact discovery to the web/search/browser source used.
- If contact details are not available after a reasonable search, recommend specific discovery steps such as checking the author page, contact page, LinkedIn, X, or a reputable contact-enrichment tool.
- Avoid spammy mass outreach. Personalize by page and reason.
- Flag prospects that are direct competitors or likely paid placements.
