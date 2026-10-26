---
title: "Rank Tracking Changes in OpenSEO"
description: "Since September, Google has affected all rank trackers by serving pages with altered results. We've made changes to improve your experience with Rank Tracking in OpenSEO."
author: "Carter Smith"
date: "2026-10-14"
---

If you opened Rank Tracking in the last few weeks, you may have seen lower or lost rankings for keywords that are usually consistent for your brand.

In reality, your rankings are the same. Since September, Google has been answering some automated searches with a results page that looks complete but leaves out sites that really rank. This affects every rank tracker that reads Google's results, not only OpenSEO. Nozzle [measured 8% of the pages it collected](https://www.searchenginejournal.com/analysis-google-is-poisoning-search-results-for-rank-trackers/592873/) as "poisoned", and DemandSphere [reports about 11%](https://ppc.land/google-returns-wrong-results-on-11-of-demandspheres-daily-rank-checks/).

We paused scheduled rank tracking while we worked on this. Today it's back, with a fix for both bad results pages and failed checks.

## What we saw

OpenSEO checks each keyword on desktop and mobile. When a page ranks in the top 3 on one device, it's almost always on the other one too. Before late September, we saw a mismatch for about 1% of those keywords. Since then it has been 22–37%.

The "poisoned" page isn't served every time. When we checked the same keyword again within a couple of hours, the result was different more than a third of the time.

## What changed

After every check, OpenSEO looks for out of place results:

- the check failed with an error, or
- a keyword that has ranked before now shows as not found, or sits 10 or more positions below its best.

Each of those keywords gets checked up to two more times. Then:

- **The best result wins.** If any of the three checks finds your page, that position is saved.
- **No false "lost".** If a keyword has ranked before and none of the checks find it, OpenSEO doesn't record it as lost. It shows as **Not checked** for that run, keeps its last known position, and the run is marked incomplete.

## How it's different from before

Now every check, manual or scheduled, goes through the same retries, and a page has to be missing on three separate looks before OpenSEO treats it as anything other than missing data.

On a manual check, keywords that need a retry can take up to about 30 minutes longer to fill in.

If a page really does fall out of the results you track, it shows as **Not checked** instead of lost. If a keyword shows Not checked on several checks in a row, look it up in [Google Search Console](/blogs/google-search-console-setup). Search Console data comes straight from Google and isn't affected by any of this.

## What it costs

The price shown before a check is now the most it can cost: the check itself plus two retries for every keyword on every device. That's why it now reads "up to". Most runs cost far less.

The same highest number is what your AI agent sees through [OpenSEO MCP](/docs/mcp). A check never costs more than the spending limit you approved.

If you self-host, the same retries run against your own DataForSEO account.

## Do I need to do anything?

No. Your keywords, history, and schedules are unchanged, and scheduled checks pick up where they left off. If anything looks wrong, [tell us](/support).
