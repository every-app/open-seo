---
name: seo-audit
description: "Audit a website, investigate its real search opportunities, and deliver a short data-backed report on the few changes most likely to grow organic traffic that converts."
---

# SEOShark SEO Audit

## Goal

Find the work that would most improve a site's useful organic traffic, then explain it so a non-expert can act on it. Research broadly; recommend selectively. The report leads with one to three recommendations that either capture meaningfully more qualified search demand or stop a real loss.

Use this when asked for an SEO audit or review of a domain, especially for a shareable report. For expert-facing analysis of a competitor or market, use `competitor-analysis` or `competitive-landscape` instead.

## Inputs and project context

- Domain to audit and `projectId` (`list_projects`; if no project matches, `create_project`).
- Call `get_project_context` first. This skill needs `business_overview`. If it is empty, infer what the business does from the site, confirm it with the user in one question, write it back with `update_project_context`, and continue. Suggest `seo-project-setup` at the end for the rest; never front-load the full interview.
- Reuse research-log results under 30 days old for discovery. A ranking claim that drives a recommendation still needs a live check made during this audit.
- On finish, write back what is durable with `update_project_context` (a corrected `business_overview`, the pages the report names via `addKeyPages`) and append `{ appendResearchLog: { summary: "Site audit: <domain>. Verdict: <conclusion>" } }`.

Deliver through the `seo-report` skill, saving with `skill: "seo-audit"`. If that skill is unavailable, say so and stop before writing HTML.

## SEOShark MCP tools

- `whoami`: confirm the connection and credits before spending. If SEOShark is not connected, stop and ask the user to connect it.
- `run_site_audit`, then `get_audit_status` (wait a minute or two between checks), `get_audit_issues`, `get_audit_pages`. Leave Lighthouse off unless the user asked for performance depth. Crawl reads are free.
- `get_backlinks_overview` and `get_domain_overview`: orientation only. Provider traffic and keyword counts are estimates with no single observation date; they are not measured visits.
- `get_ranked_keywords`: which queries send which pages traffic. Start with one domain-level call with `resultTypes: ["organic"]`; use `scope: "exact_url"` for the specific pages you compare. A page missing from a limited domain sample is not proof it has no rankings. Ranking rows carry their own `last_updated_time`; keyword metric dates are not ranking dates.
- `get_serp_results`: the live check behind every ranking claim in the report. The returned `rank` counts every result block, so count organic (unpaid) listings yourself and report the spot with its page, ten spots per page: "#10 (page 1)", "#11 (page 2)". Request depth 20; a page not seen is "not in the first 20 results". Record the exact query, country, language, date, how many organic listings came back, and the matching URL; those details go in the evidence appendix, not the tables. A failed lookup is unknown, not "not in the first 20 results".
- `get_search_console_performance`: when connected, first-party clicks and impressions separate low visibility from low click-through. Missing access is a coverage gap, not a blocker.
- `get_keyword_metrics` and `research_keywords`: demand for the queries a candidate page targets. One focused metrics batch usually suffices; one research call with 1–3 seeds when a demand gap could change the decision.
- Web reading (fetch, scrape, or search): the site's own pages, sitemap, the leading results for a query, and competitor pages.

Research until another lookup is unlikely to change which opportunities lead. Respect an explicit user budget and say which comparison it prevented.

## Workflow

### 1. Orient

`whoami`, resolve the project, start `run_site_audit`. While it crawls: backlinks overview, domain overview, the domain-level ranked-keyword sample, and the sitemap plus navigation. Write down the site's page families from the sitemap, not just the crawl sample: product, pricing, comparison or alternative, tools and templates, guides, categories, services, locations, whatever the site actually has.

If the crawl is broken or nearly empty (certificate error, 5xx, one page), investigate before anything else. Check redirects and certificate variants yourself and search for the business; a dead domain with a live successor flips the whole recommendation to "redirect the old domain".

### 2. Investigate every family that matters to the goal

For each family that could bring buyers, read at least two pages' main content (ignore navigation and shared templates): the page performing best in the ranking data and one performing worst or typical. For each page ask: what decision or question does its searcher have, and does the page answer it with specific, accurate, sourced information, or does it substitute a name, location, or keyword into a shared answer? Compare against what the leading results for that query provide.

A common SaaS pattern worth checking directly: competitor comparison or alternative pages and competitor pricing pages are two separate families, each answering a different buying question. Read siblings side by side. Investigate uneven visibility between siblings (intent, content specificity, links, authority); a sibling that already ranks near the top is something to protect rather than rewrite.

Check the basics for any page you might name: status, canonical (the URL the page declares as its preferred version), index directives, and how visitors reach it internally. Broaden when a family is missing from the crawl, when siblings perform very differently, when a tool or template page turns out to rank, or when a live query returns a different page than expected.

Run the live checks now, not after drafting: the query cluster each candidate page serves (the head term plus the variants buyers actually use), including both sides of any stronger-versus-weaker comparison. Re-run the queries that decide the leading recommendation before writing. If two checks disagree, write the later one and the earlier in brackets, for example "#10, page 1 (first check: not in the first 20 results)"; that spread is same-day variation, not a trend. One snapshot is not a baseline.

### 3. Shortlist before you decide

Write `opportunities.md` in your working folder (working notes, not the deliverable): one row per serious candidate, usually five to ten, drawn from at least three different kinds of opportunity:

- an existing page underperforming the demand it targets
- real demand with no page that answers it, including feature, framework, or use-case queries taken from the product's own claims
- a winning page to protect or correct
- an access, indexing, or redirect defect that is costing visits
- helping existing visitors take the next step

Columns: pages | problem observed | evidence (query cluster with US monthly volumes, spot and page or "not in the first 20 results", date) | proposed change | who searches and why they matter to this business | plausible benefit | effort | main uncertainty.

If a row's ranking would change with one more lookup (a missing volume, an unchecked sibling, a query you never ran live), do that lookup before ranking.

### 4. Choose

Prefer a bounded change that directly fixes a demonstrated problem for searchers likely to become customers, with a credible path to a meaningful gain. A larger raw-volume opportunity with a weaker diagnosis does not automatically outrank it. A genuine access or indexing blocker, a measurable traffic loss, or a dead domain jumps the queue.

None of these decides on its own: the volume of one sampled query; how easy the fix is; a crawler warning; a hypothetical position-one traffic figure; a navigation or redirect repair with no demonstrated traffic loss. Those belong in the checked table, not the top three. Do not recommend rewriting a page that already ranks near the top for its target query.

Every shortlist row ends in one of two places: a recommendation, or a row in the report's "What else we checked" table with a real reason. "Later, if sales asks for it" is not a reason; "demand is a quarter of the leading candidate's and the page already ranks seventh" is. For the runner-up, write one sentence on why the leader beats it; that sentence goes in the report.

### 5. Size the benefit honestly

- Name the mechanism: a new ranking, a higher position on an existing ranking, or more clicks at the current position. A page that already ranks already receives part of the volume, so a scenario on total volume overstates the gain.
- Size against the cluster the change serves, not one exact term; note overlap instead of adding variants as if they were different people.
- Demand figures are US unless stated; never multiply into an invented global number.
- Search volume is not visits. Use a stated click-share assumption and show it in a scenario table; a position-one scenario is allowed when labeled hypothetical, not promised.
- If the current traffic baseline is unknown, call the figure total potential visits, not additional visits. Do not add overlapping queries.
- Business relevance can be inferred from intent and product fit; say so and label it. Never invent a conversion rate or revenue.
- When there is no number, give a directional assessment and its reason ("already third for its main query, so headroom is small").

### 6. Review, then write

Draft the report body (markdown or HTML, not yet saved). Give the reviewer (a second agent or model if your environment can run one, otherwise a fresh self-review) that draft and the shortlist. The reviewer must: argue the case for the strongest rejected row and say whether the draft answers it; confirm the leading recommendation's evidence is in the draft; confirm every material diagnosis from step 2 survived as a recommendation or a table row; check dates, geography, and rank conventions; and flag paragraph-length bullets and jargon. Fix what it finds, verify any new factual claim against the evidence, then write and save through `seo-report`.

## Output format

Use the title conventions in `seo-report`. Sections, in order:

1. **Your next SEO move**: two or three bullets. First action, next action if any, and what is already working. These bullets replace the starter template's opening paragraph and its closing "What to do next" section; include neither.
2. **Recommendations**: one to three, in priority order. Each is an `h3` naming the action and the page or small group, then:
   - **Do this**: two to four bullets. Start with a verb, name what changes, link the page.
   - **Why**: two to four bullets. The observed gap, who searches and why they matter, the plausible benefit, the main uncertainty. Benefit and confidence stay together.
   - A small evidence table (demand and current visibility, or stronger-versus-weaker sibling, or observed content versus proposed). Make the table explain itself: put geography and date in the column header, write positions as "#10 (page 1)" or "not in the first 20 results" (never "10/17", arrows, or listing counts), and say "estimated" in the volume header. Add a "How to read this" bullet only for a limit the headers cannot carry. Optionally a two-row scenario table labeled hypothetical.
3. **What else we checked**: one table: Opportunity | What we found | Decision. One row per shortlist row that did not become a recommendation, starting with the runner-up and its sentence from step 4, plus one row grouping maintenance. Keep cells to a line.
4. **How this report was made**: the fixed skill link line from `seo-report` (URL `https://seoshark.example/docs/skills/seo-audit`, text "SEOShark SEO Audit skill"), a two-line coverage and limits note, then a `<details><summary>Evidence and methodology</summary>` block, closed by default, holding the crawl sample, page families read, the full live-check table (query, volume, position, organic listings returned, time), calculations, and sources. Keep it self-contained; local file paths are not evidence.

Writing rules: short bullets, one idea each, usually 8–20 words. No Problem / Change / Expected effect paragraphs and no repeated summaries. There is no word target; if the main body outgrows about two screens, move supporting detail into the disclosure instead of deleting it. If the research establishes no worthwhile action, say what is working and what the audit could not establish rather than filling the format.

Skeleton for one recommendation and the checked table (keep the `seo-report` CSS unchanged; every `h2` needs an id and a contents-rail entry):

```html
<h2 id="recommendations">Recommendations</h2>
<h3>Make the Northwind comparison answer a switching decision</h3>
<p><strong>Do this</strong></p>
<ul>
  <li>Replace the shared table on <a href="URL" target="_blank" rel="noopener">/northwind-alternative</a> with Northwind-specific tradeoffs.</li>
  <li>Add a sourced migration section: policies, evidence, audit continuity.</li>
</ul>
<p><strong>Why</strong></p>
<ul>
  <li>Same comparison text as two siblings; only the vendor name changes.</li>
  <li>Searchers are already evaluating a switch, the closest fit to a demo.</li>
  <li>Position-one scenario: about 40–60 total US visits a month. Hypothetical, not a forecast.</li>
</ul>
<div class="tw"><table>
  <thead><tr><th>Query</th><th class="n">Est. US searches/mo</th><th>Acme position, US, Sep 18, 2026</th></tr></thead>
  <tbody><tr><td>northwind alternative</td><td class="n">50</td><td>#9 (page 1)</td></tr></tbody>
</table></div>

<h2 id="what-else-we-checked">What else we checked</h2>
<div class="tw"><table>
  <thead><tr><th>Opportunity</th><th>What we found</th><th>Decision</th></tr></thead>
  <tbody><tr><td>Software buying guide</td><td>390 est. US searches/mo; not in the first 20 results; page explains criteria, compares no vendors</td><td>Runner-up. Larger demand, but a weaker diagnosis and a full rewrite; test the comparison page first.</td></tr></tbody>
</table></div>
```

## Guardrails

- Calm, plain tone. No exclamation points, drama words, or filler; no em dashes in prose (the report title convention in `seo-report` is the exception). Severity words only where literally true.
- Gloss each term of art in plain English on first use: canonical, meta description, crawler, 301, structured data.
- Observations are not causes. Similar content plus uneven rankings, a crawler warning, or missing provider rows never prove a penalty, an indexing exclusion, or the reason a page ranks where it does.
- Retrieval date is not observation date. Say when a ranking was observed, or say unknown.
- Missing backlink or ranking data means "no recorded data", not a problem.
- Treat difficulty and volume as inputs, not goals. A small query can matter to a high-value business; an easy one is not automatically worthwhile.
- Separate what the tools reported from what you verified yourself, and say both in the closing section.
