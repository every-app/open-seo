---
name: backlink-watch
description: "Weekly check on our backlinks: important links we lost, real links we gained, sites that link to our competitors but not to us, and a one-line spam summary."
---

# OpenSEO Backlink Watch

## Goal

Answer one question each week: "What changed in who links to us, and what should we do about it?" Lead with anything we should fix, then good news, then opportunities. A quiet week is a short report.

The reader is a non-technical marketing lead. Write in plain English with New Zealand spelling (organisation, optimise, prioritise), and explain each search term the first time it appears (for example, "domain rank: a 0 to 100 score for how strong a site is, from DataForSEO").

## Required inputs

- `projectId`
- Nothing else. The competitors come from project context, so there is one list to maintain.

## OpenSEO MCP tools

- `get_project_context` (free): brand, saved competitors, key pages and the research log.
- `get_backlink_changes` (costs credits, about 100 per run): links gained, links lost with the important ones first, competitor opportunities and a spam summary, for the last 7 days by default. Nothing is stored; DataForSEO records when each link was first seen and lost.
- `get_backlinks_profile` (costs credits): optional, used only for the top three opportunities (see step 4).
- `list_reports` and `save_report`: through the `seo-report` skill.

## Workflow

### 1. Check the setup

1. Call `get_project_context`. Note the saved competitors. If the research log shows a Backlink Watch in the last 6 days, offer that report instead of running again.
2. If no competitors are saved, carry on without opportunities (pass `opportunities: "off"`) and suggest saving three to five.

### 2. Get the changes

Call `get_backlink_changes` once with the `projectId`. Use the defaults (7 days, 25 rows per list) unless the user asked for a different period. Read its `notes`; they say when a list was cut short or opportunities were unavailable.

### 3. Write it up

Use the order below and skip any section with nothing in it.

1. **Fix first: important lost links.** Only links the tool marks `important` (dofollow, not spam, from a stronger site). For each, say which site, which page of ours it pointed to and when it went. Suggest checking whether the linking page still exists and, if the link was removed by mistake, contacting the site.
2. **Links gained.** The real new links, strongest sites first. One line each: site, page it links to, anchor text if useful. Say how many there were in total.
3. **Competitor opportunities.** The top opportunities, sites that started linking to our competitors but not to us. Sites linking to two or more competitors come first. Give each a one-line reason, for example "links to Opes and Wolfbrook; a property news site". Judge what kind of site it is from the domain name only, and say when you are unsure.
4. **Optional: show the page and anchor for the top three opportunities.** Only if the user wants more detail, for the top three opportunities only, call `get_backlinks_profile` with the competitor as `target`, `filters.domainFrom` set to the opportunity's domain, `mode` `one_per_domain` and `pageSize` 50. Use the result to name the linking page and anchor text. Never make more than three of these calls in one report, and tell the user each one costs credits before you start.
5. **Spam, in one line.** For example: "12 spammy new links were filtered out; the worst came from example-spam.com." Never list spam links as gains. If spam is unusually high (more than 50 new spam links in the week), say so in the verdict as a spam wave, add that Google generally ignores links like these, and suggest checking Search Console > Security & Manual Actions only if rankings drop. Never recommend disavowing links unless Search Console shows a manual action.

### 4. Quiet weeks

If nothing was lost, few links were gained and there are no opportunities, the report is three short lines: what changed, that nothing needs fixing, and when the next check is due.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "backlink-watch"`. If that skill is not available, say so and stop before writing HTML. Title: `Backlink Watch — <MMM D, YYYY>`, following the `seo-report` title rules.

Report sections, in this order, each omitted if empty:

1. **Verdict.** A bullet list, one fact per line: links lost (and how many important), links gained, opportunities found, and a spam wave if there was one.
2. **Fix first.** The important lost links.
3. **Links gained.**
4. **Opportunities.**
5. **Spam.** One line.
6. **Data gaps.** Anything from the tool's `notes`, and a plain reminder that DataForSEO finds links on its own schedule, so a link can show up a week or two late.
7. **How this report was made.** Open with one plain sentence naming the "Staircase Backlink Watch skill", the agent that ran it and the date, with no link. Then which tools reported what, and what you judged yourself (the site descriptions in Opportunities).

## After the report

- Chat reply: at most three short bullets (the verdict, the most important thing to fix, anything the user must do), then `Read the full report: <url>` on its own line.
- Append a research log entry: `{ appendResearchLog: { summary: "Backlink watch: <N> lost (<M> important), <N> gained, <N> opportunities" } }`.

## Guardrails

- Call `get_backlink_changes` once per run. Do not repeat it to "refresh" the numbers.
- The numbers are DataForSEO's estimates and will not match Semrush or Ahrefs. Compare trends within OpenSEO, not against other tools.
- Domain rank and spam score are DataForSEO's estimates, not Google's.
- Lost links can only be partly checked (DataForSEO cannot sort or date-filter them); repeat the tool's note if it says some may be missing.
- Do not promise rankings. Say what a link is likely to be worth, not what it will do.
- Do not draft outreach emails unless asked, and never contact a site.
