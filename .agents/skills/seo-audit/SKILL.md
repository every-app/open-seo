---
name: seo-audit
description: "Audit a website and deliver a one-page, plain-language SEO report anyone can act on, centered on a single do-this-week action."
---

# OpenSEO SEO Audit

## Goal

Audit a domain and produce a one-page HTML report that anyone, including a complete SEO beginner, can read once and act on. The whole report exists to support ONE action the owner can take this week; everything else is supporting detail.

Use this when asked for an SEO audit or review of a domain, especially when the output is a shareable report for a non-expert. For expert-facing analysis of a competitor or market, use `competitor-analysis` or `competitive-landscape` instead.

## Required inputs

- Domain to audit
- `projectId` (use `list_projects`; if no project matches the domain, create one with `create_project`)

## OpenSEO MCP tools

- `whoami`: confirm connection and remaining credits before spending anything. If OpenSEO is not connected, stop and ask the user to connect it.
- `list_projects` / `create_project`: resolve the `projectId`.
- `run_site_audit`: start the crawl (default page budget), then poll `get_audit_status` and read `get_audit_issues`. Use `get_audit_pages` when per-page evidence helps.
- `get_backlinks_overview`: backlink and referring-domain picture; usually the deciding data for the "one thing".
- `get_domain_overview`: estimated organic traffic and organic keyword count. Skip when the site is clearly dead.
- `research_keywords`: keyword ideas with volume and difficulty, used to propose a starting focus area. One call with 1-3 seeds taken from what the site is actually about. Skip when the site is down.

Keep total spend modest: one audit, one backlinks overview, at most one domain overview, and at most one keyword-research call. Only the overview and keyword lookups spend credits.

## Workflow

1. `whoami`, then resolve the `projectId`.
2. `run_site_audit` for the domain. While it crawls, fetch `get_backlinks_overview`.
3. When the crawl finishes, read `get_audit_issues` (and `get_domain_overview` if the site is alive).
4. If the audit comes back broken or nearly empty (certificate errors, 5xx, one page crawled): investigate before writing. Check the certificate and redirect variants yourself, and search the web for the business. A dead domain often has a live successor site, which flips the whole recommendation to "redirect the old domain".
5. Verify every finding you plan to report against the live page HTML by fetching pages yourself. Report nothing you have not seen evidence for.
6. Decide the one thing. Derive it from the data, never from generic advice. Common patterns:
   - Clean site, no backlinks: outreach to guests, partners, or directories, with a ready-to-send message.
   - Dead domain, live successor site: permanent redirect via hosting support, with the exact sentence to send them.
   - Blocked or noindexed pages: remove the block.
   It must be doable this week by a non-technical person, with copy-paste-ready mechanics included.
7. When the site is healthy, propose a starting focus area: run one `research_keywords` call seeded from the site's actual topic, then pick one theme and 3 to 5 specific, low-difficulty keywords the site can realistically rank for, each with the page or post to make. This is a starting direction, not a keyword strategy; point the user at the `keyword-research` skill for the full workflow. Skip this step entirely when the site is down — the one thing is all that matters there.
8. Write the report using `template.html` in this skill directory (see Output format).
9. Review before delivering: run an adversarial pass with a second agent or model if your environment has one, otherwise do a fresh self-review. Give the reviewer the verified facts and have it attack four things: claims beyond the facts, unglossed jargon, anything overwhelming for a beginner, and dramatic language. The reviewer may also flag true facts it was not given; check those against your evidence instead of "fixing" them.
10. Deliver the report: if your environment can publish or preview HTML (for example as an artifact), do that; otherwise save the HTML file and tell the user to open it in their browser.

## Output format

Use `template.html` next to this file. Fill in content; keep the CSS and structure as they are (light palette only, no dark mode).

- Header: domain as the title, the review date on its own line under it, then a 2-3 sentence summary of the whole report (overall state; the main gap and the one thing; what the report covers).
- Section order: verdict, the one thing, small fixes (5 to 10 max, ordered by impact), where to focus first (healthy sites only), already working, method footer.
- Each fix row shows the exact evidence (a quoted tag or number) and concrete steps a non-technical person can follow.
- "Where to focus first" names one topic area and 3 to 5 keywords, each with its search volume in plain words and the page or post to make. Omit the section when the site is down.

## Guardrails

- Tone: calm and plain. No exclamation points, no drama words, no em dashes, no "Not X. Y." contrasts, no filler. Severity words only where literally true (a down site is critical; a long title is not).
- Gloss every term of art in plain English on first use: canonical, meta description, alt text, crawler, 301, structured data.
- Skip nitpicks that do not matter for the specific site. A beginner report with twenty findings has failed.
- Missing backlink or ranking data means "no recorded data", not a penalty; say so rather than dramatizing it.
- Favor keywords the site can win now: specific intent, low difficulty. Do not list head terms a new site cannot rank for yet.
- Separate what the tools reported from what you verified yourself, and note both in the method footer.
