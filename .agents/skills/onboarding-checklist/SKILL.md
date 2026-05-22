---
name: onboarding-checklist
description: Guide a new OpenSEO user through workspace setup, site goals, positioning context, MCP checks, SEO strategy, and Search Console data intake.
---

# OpenSEO Onboarding Checklist

## Goal

Help the user set up a durable SEO workspace and gather enough context for future OpenSEO workflows to be useful. This is an intake and readiness workflow, not a full audit.

## Tone

Be friendly, practical, and structured. Ask questions in small batches. Explain why each item matters only when useful. Do not overwhelm a beginner with jargon.

## Checklist

### 1. Pick a working folder

Suggest that the user choose or create a local folder for SEO work, for example:

- `~/SEO/<company-or-site>/`
- `~/Documents/SEO/<company-or-site>/`
- A repo or workspace folder if SEO work should live beside website/content files

Explain that keeping notes, exports, briefs, scraped pages, and reports in one folder helps the agent build context over time.

Recommended starter structure:

```text
seo-workspace/
  README.md
  gsc/
  keywords/
  competitors/
  content/
  outreach/
  reports/
```

Do not create folders unless the user asks. If file tools are available and the user asks, create a simple structure and a short `README.md` with the current goals and known sites.

### 2. Collect website scope

Ask for:

- Primary website/domain
- Additional domains or subdomains
- Important products, services, categories, or pages
- Target countries/languages
- Whether the site is new, established, migrating, or recovering from a drop
- CMS or publishing workflow, if relevant

### 3. Capture goals

Ask the user what they want from SEO:

- More qualified leads
- More signups/trials
- More ecommerce revenue
- More newsletter/audience growth
- More brand/category awareness
- Recovery from traffic loss
- Better ranking for specific pages

Ask for success metrics and timeframe. If goals are vague, help turn them into measurable goals such as "increase non-branded organic signups" or "rank top 10 for 20 buying-intent terms."

### 4. Capture positioning and strategy context

Ask what research they have already done about the company, product, audience, and competitors. Request any notes, docs, customer interviews, positioning docs, pitch decks, landing pages, or strategy memos they can share.

Probe for:

- Who the product or site is for
- What pain it solves
- Why users choose it over alternatives
- Competitors and substitutes
- Strong opinions or positioning claims
- Best customers and bad-fit customers
- Existing content that already converts
- Topics they do not want to target

If the user has not done this yet, offer to help research positioning using the company website, competitor pages, reviews, forums, and web search.

### 5. Verify OpenSEO MCP

After the user has described the company, website, goals, and positioning, check that OpenSEO MCP is configured and mapped to the right project:

1. Use `whoami` if available.
2. Use `list_projects` to confirm the user can access projects.
3. Match the project to the website/domain they want to rank for.
4. If the project list is ambiguous, ask the user which project should be used.
5. If the MCP is unavailable, tell the user to connect OpenSEO MCP before continuing with live OpenSEO data.

Do not run research tools just to test connectivity; `whoami` and `list_projects` are enough.

### 6. Request Google Search Console export

Ask the user to export a CSV from Google Search Console and place it in the SEO working folder.

Recommended exports:

- Queries: last 3 months and last 16 months if available
- Pages: last 3 months and last 16 months if available
- Query + page combinations when possible
- Countries/devices if relevant

Ask them to drop files into `gsc/` and use names like:

```text
gsc/queries-last-3-months.csv
gsc/pages-last-3-months.csv
gsc/queries-last-16-months.csv
gsc/pages-last-16-months.csv
```

Explain that GSC data reveals existing impressions, near-ranking terms, cannibalization, and pages that already have search demand.

### 7. Inventory existing assets

Ask for or discover:

- Sitemap or important URL list
- Current blog/resources/content library
- Product/category/feature pages
- Existing keyword lists
- Current rank trackers
- Backlink or PR assets
- Linkable assets such as studies, templates, tools, datasets, calculators, or original opinions

### 8. Recommend first workflow

After intake, recommend one next OpenSEO workflow:

- `keyword-research`: when the user needs ideas from seed topics
- `keyword-clustering`: when they have keywords or GSC data to map to pages
- `competitive-landscape`: when the market is unclear
- `competitor-analysis`: when they know a competitor to study
- `link-prospecting`: when they have a linkable asset or target page

## Output format

Use a checklist with statuses:

| Step | Status | Notes | Next action |
| ---- | ------ | ----- | ----------- |

Then summarize:

- Working folder
- OpenSEO MCP/project status
- Sites in scope
- Goals
- Known positioning
- Uploaded data/files
- Recommended next workflow

## Guardrails

- Keep setup lightweight. The user should feel oriented, not assigned homework.
- Do not pretend a GSC CSV has been uploaded unless you can see it.
- Keep onboarding focused on setup and context unless the user asks for live research.
- If web search or scraping is used for positioning research, distinguish source evidence from inference.
