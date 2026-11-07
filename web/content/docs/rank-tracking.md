---
title: "Rank tracking"
description: "Track where your site ranks on Google for the keywords you care about, on a schedule, and read the results."
---

Rank tracking checks where your site ranks in Google's results for each keyword you track, on desktop, mobile or both, in a country or a city. Checks run on a schedule or when you start one, and each check uses credits.

## Set up a tracker

1. Open **Rank Tracking** in the project sidebar, under My Site.
2. Click **Add Domain**.
3. Fill in the form:
   - **Target Domain:** the site whose rankings you want.
   - **Country** and **Language:** these start from your project's market.
   - **Search Targeting:** **National** for the whole country, or **Local** to search for a city, county or region in that country.
   - **Devices:** **Mobile only** (the default), **Desktop only** or **Desktop + Mobile**. Tracking both devices costs twice as much.
   - **Schedule:** see below.
   - **Search Depth:** how many results to look through, from the top 10 to the top 100. The default is the top 40. A ranking below that depth isn't found.
4. Click **Add Domain**.
5. OpenSEO suggests keywords the domain already ranks for, with the top 20 by traffic selected. Click **Save Keywords**, or **Skip** to add your own.

To add keywords later, open the tracker, click **Add Keywords**, and enter one per line. Keywords are saved in lowercase unless you tick **Match case**. A tracker holds up to 1,000 keywords. New keywords are checked straight away, which uses credits. If a scheduled check is due within the hour, they wait for it instead.

For help choosing keywords, see [Which keywords to track](/library/rank-tracking/which-keywords-to-track).

## Schedule checks

Choose **Daily**, **Weekly** (the default), **Monthly (end of month)** or **Manual only**. Click **change** next to the schedule to pick the weekday and time, in your own timezone. Daily checks use 7 times the credits of weekly ones.

To check now, open the **⋯** menu on the tracker and choose **Check rankings**. The dialog shows how many keywords and devices it covers and what it costs at most. A check usually takes about an hour, and at most 2 hours. Starting a check doesn't change the schedule.

To change any setting later, click **Configure** on the tracker.

## Credits

The app shows the most a check can cost before you set up a tracker or start a check, so you approve the maximum. The setup form shows the price per keyword per check, and for scheduled trackers what 50 keywords would cost a month.

The most a check costs per keyword:

| Search depth     | One device | Desktop + Mobile |
| ---------------- | ---------- | ---------------- |
| Top 10           | $0.0046    | $0.0092          |
| Top 20           | $0.0080    | $0.0161          |
| Top 40 (default) | $0.0150    | $0.0299          |
| Top 100          | $0.0357    | $0.0714          |

For example, 100 keywords on mobile at the default depth cost up to $1.50 a check. Checked weekly, that's up to $6 a month; checked daily, up to about $45. A keyword that contains a search operator such as `site:` or `intitle:` costs 5 times as much.

A check starts only if you have enough credits to cover its maximum. If you don't, it doesn't run, and a scheduled check is skipped until you add credits.

On the free plan you can set up trackers and keywords, but no checks run until you upgrade. See [Plans, credits and billing](/docs/billing).

## Read the results

Each tracker shows a table with each keyword's position, the ranking URL, search volume, keyword difficulty, CPC and the SERP features on the page, such as AI Overviews, People Also Ask and local packs.

- **Position** shows the change, such as "8 → 5", against the comparison you pick: **vs yesterday**, **vs last week**, **vs last month** or **vs 90 days ago**. "lost" means the page dropped out of the results you're tracking.
- **Desktop + Mobile** trackers have a toggle to switch between devices.
- The **Position distribution** chart groups keywords into the top 3, 4 to 10, 11 to 20 and beyond, over 30 days, 90 days or all time.
- After two full checks, switch to **History** to see each keyword across the last 12 checks.
- Click a keyword to see its position over time, or open its results on Google.
- Click the star to pin a keyword. Pinned keywords stay at the top.
- Use **Filters** to narrow by keyword text, position, volume, difficulty or CPC, and **Export** to send the rows to Google Sheets or a CSV file.

### Keywords marked "Not checked"

Sometimes Google returns no result for a keyword on a check. The keyword shows as **Not checked**, keeps its last known position, and the tracker says "Some keywords couldn't be checked."

A keyword that wasn't checked hasn't lost its ranking. Before you report gains and losses, check that the latest check covered the keywords you're comparing. For a second opinion on your own site, compare with [Search Console](/docs/google-integrations), which shows the average position Google measured. [Rank tracking changes](/blogs/rank-tracking-changes) explains how OpenSEO handles unreliable results.

## Remove keywords or archive a tracker

- **Remove keywords:** select them in the table and click **Remove**. Their history is kept but no longer shown.
- **Archive a tracker:** click the archive icon on its row in the **Tracked Domains** list. Scheduled checks stop and the tracker is hidden, but its history is kept. Add the same domain again to bring back its keywords and history.

## Use your assistant

With [OpenSEO MCP](/docs/mcp) connected, your agent can create trackers, add and remove keywords, pin keywords, estimate a check's cost for free, run checks and read positions and history. Trackers it creates are manual, mobile and top 40 unless you ask for something else. Adding keywords through the agent doesn't start a check; it asks you to approve the cost before running one. Changing a schedule or archiving a tracker happens in the app.

For a ranking report template, see [Keyword ranking report](/library/rank-tracking/keyword-ranking-report).

## Self-hosting

Self-hosted rank tracking uses your own DataForSEO key, with no plan or credit checks. Schedules run the same way. See [Self-hosting](/docs/self-hosting).
