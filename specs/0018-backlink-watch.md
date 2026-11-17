# Backlink Watch (weekly links gained, lost, and competitor link opportunities)

## Status

Proposed, November 2026. Custom feature for the Staircase fork of OpenSEO.

## Why

OpenSEO can look up backlinks, but it does not watch them. The dashboard saves a daily total only when someone opens it, never shows that history, and never says which links changed.

Totals are also misleading on their own. In November 2026 staircase.co.nz showed 142 referring domains and a rising growth chart, but much of the recent rise was spam: about 20 near-identical `bio-links-c###.xyz` sites and dozens of `.shop`, `.online` and casino domains with spam scores of 60 to 80. A useful weekly view has to separate real links from junk.

## What it does

A new MCP tool, `get_backlink_changes`, returns three lists for a project, for a recent window (default the last 7 days):

1. **Gained**: real links we gained (first seen in the window), one row per linking domain, spam filtered out.
2. **Lost**: links we lost in the window. A lost link is **important** when it is dofollow, its spam score is at or under the threshold, and its linking domain rank is at or above `importantMinDomainRank` (default 20, on DataForSEO's 0 to 100 scale; tune after the first runs). Important lost links are listed first.
3. **Competitor opportunities**: sites that link to one or more of the project's saved competitors but not to us, from DataForSEO's domain intersection endpoint, spam filtered. Default: only links the competitors gained in the window (new outreach targets each week). With `opportunities: "all"`, the top opportunities regardless of date (a one-off outreach list). Each row says which competitors it links to and how many; sites linking to 2 or more competitors are listed first, because they are the most likely to link to us too.

Plus a **spam summary**: how many new links in the window were filtered out as spam, and the top spam domains, so a sudden spam wave is visible without cluttering the lists.

Each row carries the linking page, target page, anchor text, dofollow or nofollow, domain rank, spam score, and first seen or lost date.

## How it works

Runs in the app worker, at read time, through the existing DataForSEO backlinks client (`src/server/lib/dataforseo/backlinks.ts`). Nothing is stored: DataForSEO already records when each link was first seen and when it was lost, so "what changed this week" is a filtered query, not a comparison of saved snapshots.

1. **Our domain** comes from the project. **Competitors** come from Project Context (the saved competitor list; currently lighthousefinancial.co.nz, opespartners.co.nz, propellorproperties.co.nz, wolfbrook.co.nz). With no competitors saved, skip section 3 and say so in `notes`.
2. **Gained**: `backlinks/backlinks/live`, status `live`, filter `first_seen` on or after the window start, `one_per_domain`, spam filter on, sorted by domain rank.
3. **Lost**: `backlinks/backlinks/live`, status `lost`, filtered to the window by `lost_date`. DataForSEO's docs confirm `first_seen` as a filter but not `lost_date`; if `lost_date` cannot be filtered, fetch lost links sorted newest first and filter in code, capped at one page of 1,000 rows, and say so in `notes` if the cap was hit.
4. **Spam summary**: the same gained query with the spam filter off, counted, minus the gained list.
5. **Competitor opportunities**: `backlinks/domain_intersection/live` with the competitors as `targets` (max 20) and our domain in `exclude_targets` (max 10), `intersection_mode` "one_match" or the closest equivalent so a domain linking to any one competitor counts, spam filtered, and for the default mode a `first_seen` filter on the window start. Order by number of competitors linked, then domain rank.
6. **Return** the lists (each capped, default 25 rows, input `maxRows` up to 100) with full counts in `summary`, the window dates, the spam threshold used, the credits spent, and notes.

The spam threshold reuses OpenSEO's existing backlinks default (`DEFAULT_BACKLINKS_SPAM_THRESHOLD`, currently 40) so this tool and the Backlinks page agree.

## Cost

Paid: about four DataForSEO requests per run (gained, lost, spam count, intersection). The tool description states the typical credit cost, following the other backlinks tools. A weekly run for one project should cost roughly the same as two `get_backlinks_profile` pages.

## Inputs

- `projectId` (required)
- `sinceDays` (optional; default 7, max 90)
- `opportunities` (optional; `"new"` default, `"all"`, or `"off"`)
- `maxRows` (optional; default 25, max 100, per list)
- `importantMinDomainRank` (optional; default 20)

## Where the code goes

New files:

- `src/server/features/backlink-watch/backlinkWatchThresholds.ts`: defaults above as named constants, each with a comment.
- `src/server/features/backlink-watch/backlinkWatchRules.ts`: pure functions (no I/O): window filtering, the "important lost link" rule, opportunity ordering, spam counting.
- `src/server/features/backlink-watch/backlinkWatchRules.test.ts`
- `src/server/features/backlink-watch/BacklinkWatchService.ts`: calls DataForSEO, applies the rules, records billing the same way the existing backlinks service does.
- `src/types/schemas/backlinkWatch.ts`: Zod input and output schemas.
- `src/server/mcp/tools/get-backlink-changes.ts`: the MCP tool, following `get-backlinks-profile.ts` and `get-audit-search-checks.ts`.
- `plugins/openseo/skills/backlink-watch/SKILL.md`: the weekly report skill (below).

Small changes to existing files:

- `src/server/lib/dataforseo/backlinks.ts`: let callers choose `backlinks_status_type` (default stays `live`, so existing behaviour is unchanged) and add a domain intersection fetch.
- `src/server/mcp/server.ts`: register the tool, one line next to the other backlinks tools.
- `scripts/sync-plugin-skills.mjs` needs no change (it now leaves plugin-only skills alone).

No database tables, migrations, workflows, crons or environment variables.

## The weekly report (skill)

`backlink-watch/SKILL.md` tells Claude to:

1. Call `get_project_context` and `get_backlink_changes` for the project.
2. Lead with any **important lost links** ("fix first": check whether the linking page still exists, and contact the site if the link was removed by mistake).
3. Then real links gained, then the top competitor opportunities with a one-line reason each ("links to Opes and Wolfbrook; a property news site"), then the spam summary in one line.
4. Save it with `save_report` (`skill: "backlink-watch"`, through `seo-report`), and add one line to the research log with `appendResearchLog`.
5. Keep it short: a quiet week is a three-line report.

## Scheduling

No code. A Claude scheduled task runs the skill every Monday morning (NZ time) for the Staircase project and saves the report in OpenSEO. Set it up after the tool is deployed, and run it once by hand first.

## Limits

- DataForSEO finds links on its own crawl schedule, so a link can show up a week or two after it went live, and "lost" can lag too. Over a few weeks the picture is reliable even if one week is late.
- Totals will never match Semrush or Ahrefs. Compare trends within OpenSEO.
- Domain rank and spam score are DataForSEO's estimates, not Google's.
- A few big spam waves can exceed the spam count's single page; the count is then shown as "1,000+".

## Build phases

1. **Now**: the tool, rules, tests, the skill, and the weekly scheduled task.
2. **Later (optional)**: a "Backlinks this week" card on the dashboard; competitor opportunities feeding the Gap Plan's Authority-limited keywords; per-page watch for key landing pages.
