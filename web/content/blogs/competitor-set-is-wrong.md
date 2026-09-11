---
title: "Your Competitor Set Is Wrong, and So Are Their Numbers"
description: "Four corrections that turn a competitor list into something you can plan against: measure the set instead of naming it, strip the brand terms, read pages instead of the traffic headline, and open the link profile before you copy it."
author: "Jeremy Rivera"
date: "2026-09-11"
---

Ask a founder who they compete with and three company names arrive in under a second. Ask where the names came from and the answer is sales calls and a pitch deck. Neither source has ever watched a search result.

Somebody then exports a traffic estimate for one of those companies, the number lands in a slide, and a quarter gets planned around it.

Both halves of that fail in ways you can measure. Search ranks pages while your sales team ranks companies, so the list is built on the wrong unit. And a competitor traffic number is a model of what a domain probably gets, which makes it correctable once you know how it goes wrong.

Each correction below has a strategy behind it in the [competitive analysis library](/library/competitive-analysis). To run them with an agent, connect [OpenSEO MCP](/docs/mcp) first so it can pull live SERP, ranking, domain, and backlink data.

## Table of Contents

- [The competitors you name are not the ones you rank against](#the-competitors-you-name-are-not-the-ones-you-rank-against)
- [Subtract the brand terms or you are measuring fame](#subtract-the-brand-terms-or-you-are-measuring-fame)
- [The traffic number is a headline, not a finding](#the-traffic-number-is-a-headline-not-a-finding)
- [Read a link profile before you copy it](#read-a-link-profile-before-you-copy-it)
- [Do it with OpenSEO](#do-it-with-openseo)
- [Rebuild the set before you plan the quarter](#rebuild-the-set-before-you-plan-the-quarter)

## The competitors you name are not the ones you rank against

Jason Wade of Ninja AI has a fast way to settle the question, and it does not involve a battlecard. On the [Unscripted SEO podcast](https://unscriptedseo.com/what-ai-visibility-really-means-and-why-its-not-a-buzzword/) he described how he finds out who is in the way:

> you know how you can tell who works? Google your competitor and yourself and see what pops up. Just copy what works.

Do that at scale across a keyword set and the list that comes back stops looking like a market map. Comparing five terms in the property restoration category returned Yelp at position 5 by visibility, Home Depot at 10, and YouTube at 12. None of those three sell restoration work. On the city-modified version of the same term, a single local operator held the top spot while the national brand sat at 3.

Sort what comes back into three groups, because you handle each one differently. Aggregators like Yelp are a listing problem, since you will not outrank them and you can appear inside them. Publishers who own the informational half are a distribution problem. Only the third group, the operators whose service pages sit next to yours, is a ranking problem. Put all three on one list and you will plan content against fights you cannot win.

The [find your real competitors](/library/competitive-analysis/find-your-real-competitors) strategy walks the comparison and the sorting. It runs through the MCP rather than a screen in the app, because the question needs a keyword set and a judgment call on every result that comes back.

## Subtract the brand terms or you are measuring fame

Pull ranked keywords for two domains in the same market and the counts do not belong on the same axis. The national restoration brand ranks for 49,475 organic keywords. A regional operator in the same category ranks for 79.

A raw gap analysis reports 49,396 opportunities, which is not a list anyone can work through.

The smaller number is also mostly noise. The regional operator's list opens with its own brand name, several competitors' brand names, a street address, and a local civic app. Strip brand from both sides and the real gap comes down to three near-miss service pages.

Ann Smarty has spent twenty years watching what happens once a brand starts to work. On the [Unscripted SEO podcast](https://unscriptedseo.com/ann-smarty-llm-consensus-reddit-brand-control/) she named the cost:

> Being a brand is great, but no one talks about how ... you lose control over it, because stuff starts ranking for your name.

Her point runs in both directions. Losing control of your own branded results is a reputation problem you have to manage. Counting somebody else's branded results as competitive strength is an analysis problem you can fix in one filter. The ranked-keyword tool in OpenSEO's MCP accepts an `excludeBrandTerms` list of up to ten terms, so you hand it the brand names to drop on each side before anything gets counted. There is no equivalent filter on the domain screen in the app. The [keyword gap strategy](/library/competitive-analysis/keyword-gap-analysis) covers what to do with the remainder.

## The traffic number is a headline, not a finding

Nobody outside a company can see its analytics. A traffic estimate is built by finding the keywords a domain ranks for, looking up each keyword's estimated volume, applying an assumed click-through rate for the position held, and adding it up. The arithmetic is sound and the output is still an estimate, wrong in directions you can name.

Kristiyan Yankov of Above Apex opened his interview by refusing to be taken at his word:

> you shouldn't trust anyone. You should verify. You should verify, especially in our industry.

Apply that to the estimate itself. A [domain overview](/features/domain-overview) on the national restoration brand returned 3,023,467 estimated organic traffic across 49,475 keywords on 19 August. Running the identical query on 21 August returned 3,018,438 across 49,729. Two days moved the traffic estimate by five thousand visits and added two hundred and fifty keywords. Neither figure is a measurement, and quoting either one to the last digit is where the trouble starts.

![OpenSEO domain overview for a national restoration brand, Top Pages tab, showing 7,587 pages against 49,729 keywords, with three general and carpet cleaning pages sitting inside the top five by traffic](/blog/competitor-set-is-wrong/restoration-competitor-top-pages-openseo.png)

The pages tab is where the estimate stops flattering anyone. The single highest-traffic page is the water damage service page at 372,528, carrying 488 keywords. Beside it sit general cleaning at 338,557, air duct cleaning at 286,978, and carpet and upholstery cleaning at 269,678. Those three pages account for 895,213 of the estimate, close to thirty percent of the whole footprint, and they belong to a cleaning business rather than the restoration business a reader would be benchmarking against. Anyone who benchmarked against three million and planned a restoration content calendar around it just picked a fight with a carpet cleaner.

Keyword counts inflate for a related reason. The same pull returned five mold-related keywords each reporting an identical 74,000 search volume and an identical 22,496 traffic estimate, four of the five resolving to the same URL.

![Five mold-related keywords in an OpenSEO ranked-keyword table, each showing the same 74,000 search volume and the same 22,496 traffic estimate, four of them pointing at one mold remediation page](/library/competitive-analysis/close-variant-keyword-inflation-openseo.png)

Google reports one combined volume for close variants, so plurals and near-identical phrasings each inherit the group figure. Count them as five keywords and you have counted the same demand five times. OpenSEO can split those groups apart with clickstream data, which doubles the credit cost of the seed. With 49,729 keywords spread across 7,587 pages, the page count is the unit that cannot double-count. The [competitor traffic estimates strategy](/library/competitive-analysis/competitor-traffic-estimates) covers the rest of the corrections.

## Read a link profile before you copy it

The restoration brand's [backlink profile](/features/backlinks) opens at 596,564 backlinks from 13,980 referring domains. That works out to roughly 43 links per domain, which means the headline number is measuring repetition rather than reach. Referring domains is the figure worth writing down.

Two smaller numbers sit in the same panel: 2,217 broken backlinks across 529 broken pages. Those are links already pointed at the domain and landing on nothing. Every one is a site that already decided this topic was worth a link, which makes the ask shorter than a cold pitch, though it is still an ask.

Kristiyan Yankov judges opportunities with a test that survives contact with any tool:

> if I look at a link-building opportunity and it makes sense to me, it would be the same for Google, because Google is definitely not more stupid than me.

Christopher Gimmer, who bootstrapped Snappa, has watched which sites kept their rankings through the last two years of updates. On the [Unscripted SEO podcast](https://unscriptedseo.com/christopher-gimmer-bootstrapped-saas-ai-overviews/) he described the pattern:

> it seems that anyone who's had a legitimate product within a specific space tends to be doing much better than just a pure content site.

Read together, those two comments narrow what a link gap is for. Treat it as a read on which publications, directories, and communities the market already trusts, and on which of them would have a reason to point at you. The full list of domains your competitor has collected is a different document, and a longer one. The [link profile strategy](/library/competitive-analysis/backlink-gap-analysis) covers the metrics worth reading and the ones worth ignoring.

## Do it with OpenSEO

OpenSEO has no two-domain diff report. It has both halves, ranked keywords and backlink profiles per domain, and the join happens in the agent. You can filter the join on the way through, which a fixed report will not let you do, and you have to describe the join yourself every time.

### 1. Measure the set

Compare the domains that appear across a keyword set you want to own, then sort the result into aggregators, publishers, and real competitors.

### 2. Strip brand from both sides

Exclude brand terms on your domain and on theirs before anything gets counted as a gap.

### 3. Read pages, then keywords

Take the top pages by traffic and name the business each one serves. Close variants stack; pages do not.

### 4. Read the link profiles

Referring domains rather than backlinks, plus the broken backlinks and broken pages the profile is already carrying.

### Full Prompt: Rebuild a Competitor Set

```text
My domain is [mydomain.com]. I sell [what you sell] to [who buys it].
Here are 10-20 terms I want to own: [paste].

1. Measure the set

Compare SERP competitors across those terms. Return every domain by
visibility, and for each one tell me whether it is an aggregator I should
get listed on, a publisher that owns the informational half, or a direct
competitor I could outrank.

2. Strip the brand terms

Pull ranked keywords for me and for the top 3 direct competitors with
brand terms excluded on both sides. Report the gap after that filter,
not before it.

3. Read the pages

For each of those 3 competitors, pull ranked keywords and group them by
landing URL so I get pages ordered by estimated traffic with the keyword
count per page. Tell me what business line each page serves, and flag
any page whose topic sits outside the market I named.

4. Read the link profiles

Give me referring domains rather than backlinks, the spam score, and
the broken backlinks and broken pages counts for each competitor.
Output the whole thing as one document.
```

The agent has to do that grouping itself, because the MCP returns keyword rows rather than a pages report. The Pages tab on a domain in the app does the same grouping for you.

The [competitor analysis skill](/docs/skills/competitor-analysis) runs the per-domain work, and [competitive landscape](/docs/skills/competitive-landscape) handles the stage before you know which domains matter.

## Rebuild the set before you plan the quarter

Jeremy Moser runs uSERP and turns down gray-area work on longevity grounds rather than moral ones:

> it's a ticking time bomb ... you're just kind of asking to get burned at a certain point

An unmeasured competitor set has the same shape. It holds up while the plan is theoretical and breaks the first time real money follows it.

Three things to do before the next planning cycle:

1. Replace the named competitor list with a measured one, sorted into the three groups
2. Rerun the keyword gap with brand excluded on both sides, and see what survives the filter
3. Open the pages tab on every competitor whose traffic number you have quoted to anyone, and check that the traffic belongs to the business you thought you were benchmarking against

The [competitive analysis library](/library/competitive-analysis) has the full workflow for each of those. Running them costs money, because SEO data costs money everywhere: [OpenSEO](https://openseo.so/) is $10 a month with $10 of usage credits included. The free trial carries $0.50 of credits, which covers a handful of lookups. The four-step workflow above costs more than that.
