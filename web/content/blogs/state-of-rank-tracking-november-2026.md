---
title: "State of Rank Tracking: November 2026"
description: "Google made two changes this fall that affect every rank tracker. Here's what happened, and what we're changing in OpenSEO."
author: "Carter Smith"
date: "2026-11-04"
---

If your rankings have looked jumpy this fall, it’s most likely because of changes Google made. This blog picks up from our [October post on rank tracking](/blogs/rank-tracking-changes).

Even with these changes, we want to deliver the best possible experience to you. We’ve modified our rank tracking process, so here is what to expect from us:

- OpenSEO now looks at every keyword at least three times per check.
- Positions should be much more consistent from one check to the next.
- Checks take about an hour and cost more.

## What Google changed

### Altered results pages

Since September, Google has been answering some automated searches with a page that looks normal but has the sites or positions scrambled from real results. This gives rank trackers inaccurate results.

### Wrapped links

Google also started sending many links through a `google.com/goto` redirect instead of linking straight to the page. A rank tracker finds your site by its domain, and a wrapped link looks like a result for google.com. This means trackers couldn’t locate your page in the results.

## What we're changing

In October, we added extra checks for rank tracking keywords, but only for those that appeared incorrect, such as one that dropped out of the results. This left a gap for results that included scrambled positions.

Now:

- Every keyword gets three checks on every device, a few minutes apart.
- If a check misses your page, or the positions differ by more than 2 places, OpenSEO keeps looking, up to six times.
- The best position wins.

## What checks are like now

### Manual checks

In order to give you more trustworthy results, the time it takes for a manual rank tracking run will increase to about an hour.

- Before a check starts, you'll see the number of keywords and devices, the cost, and the estimated time.
- Your previous positions stay in the table until the check finishes.

### Scheduled checks

Nothing changes in how you use these. They run at the time you choose, and the new positions are there the next time you open OpenSEO.

### Cost

The price shown before a check is the most it can cost: six checks at every keyword on every device. Most runs will cost close to that in order to make sure the results are accurate.

For 100 keywords on both devices at the default depth, that's up to $3.00 per check. Previously, it was up to $1.50 for scheduled checks and $2.66 for manual ones.

To lower the cost, track one device, use a shallower depth, or remove keywords you don't act on. If you self-host, the same checks run against your own DataForSEO account.

## How this compares to other rank trackers

Every tracker is dealing with the same Google changes. Here's what some of the larger ones have published:

| Tool       | How often it updates                     | What they've said about bad results                                           |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Semrush    | Daily, "generally" within 24 to 48 hours | Flags suspect results for another collection attempt                          |
| Ahrefs     | Weekly by default, daily at most         | Filters abnormal results and requests replacements                            |
| AccuRanker | Daily                                    | Fetches page 1 again when under half of its recent sites appear               |
| SE Ranking | Daily                                    | Rechecks affected dates, and says a manual recheck may take more than one try |

## What this won't fix

- Google may change this again, and we'll keep adapting.
- Results still vary by location, device, and time, so OpenSEO won't always match what you see in your browser.
- If you are ever doubting your rankings, check [Google Search Console](/blogs/google-search-console-setup), which comes straight from Google and isn't affected by any of this.

## Do I need to do anything?

No. Your keywords, history, and schedules are unchanged. A check only starts if your balance covers the price shown, so large trackers may need more credits than before. If anything looks wrong, [tell us](/support).
