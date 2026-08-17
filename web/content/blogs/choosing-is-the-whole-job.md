---
title: "Choosing Is the Whole Job Now"
description: "AI made every SEO task cheap to run. It did not make the wrong task any cheaper. OpenSEO's founder on roadmap discipline, and how to run the same filter over your own SEO backlog."
author: "Jeremy Rivera"
date: "2026-08-17"
---

![Article header in the OpenSEO house style. Eyebrow reading OpenSEO, Interview, above the headline "Choosing Is the Whole Job Now" and a motif of nine candidate bars with a single one picked out in orange.](/blog/choosing-is-the-whole-job/header.png)

Sixty pull requests were sitting open on the OpenSEO repository, most of them from people the project had never met. Ben Senescu, who has been building OpenSEO since February, stopped merging all of them and posted a roadmap instead.

He was not short of contributors. He was short of a reason to prefer one contribution over another.

> I'm sure most of the PRs are really good, but I I can't just like add a hundred things to the app all at once because I'm certain even if only one of them breaks, it's like how do you track that all down?
>
> Ben Senescu, founder of OpenSEO

![Large orange numeral 60 beside the line "He stopped merging good work from real contributors and published a roadmap instead," with supporting figures: 50 open issues, 5 months of building, 1 maintainer, February 2026 started building.](/blog/choosing-is-the-whole-job/sixty-open-pull-requests.png)

That reads as a product problem. It is the same problem sitting in your SEO backlog. You have ten things an agent could execute this afternoon and no test that says which one earns money.

If you want an agent to run the selection procedure at the end of this post, connect the [OpenSEO MCP](/docs/mcp) first so it can read your live ranking and Search Console data.

## Table of Contents

- [Doing the work stopped being the constraint](#doing-the-work-stopped-being-the-constraint)
- [Speed makes bad choices cheaper to make](#speed-makes-bad-choices-cheaper-to-make)
- [The number that flatters you is not the number that pays you](#the-number-that-flatters-you-is-not-the-number-that-pays-you)
- [A flagged issue is not automatically a real issue](#a-flagged-issue-is-not-automatically-a-real-issue)
- [GEO is where choosing costs the most](#geo-is-where-choosing-costs-the-most)
- [The filter that survives the churn](#the-filter-that-survives-the-churn)
- [Do it with OpenSEO](#do-it-with-openseo)
- [What to do Monday morning](#what-to-do-monday-morning)

## Doing the work stopped being the constraint

For twenty years the reason a small business did no SEO was that SEO was slow. Somebody had to mine the keywords, write the pages, edit the titles one CMS screen at a time. Ben puts the old price in hours.

> It's really hard to do SEO. Like it took lots of time. You need to like spend like 10, 20 hours a week doing it.
>
> Ben Senescu, founder of OpenSEO

That price is what kept cheap tools from making sense. If the software was going to cost you a working day every week regardless, the subscription line was never the expensive part. In his words, an affordable SEO tool "didn't make any sense because you were gonna spend so much time doing it anyway."

![Two-row comparison in the OpenSEO palette. The row labelled "Doing the work" shrinks from a full bar marked "10 to 20 hours a week" before agents to a sliver marked "a prompt" with agents. The row labelled "Choosing the work" is identical in both columns. A footnote marks the chart as illustrative apart from the 10 to 20 hours figure.](/blog/choosing-is-the-whole-job/cost-of-doing-vs-choosing.png)

Agents removed that day. What they did not remove is the part where somebody decides which day's worth of work was the right one. So the bottleneck moved, and most backlogs have not noticed. If you are picking a tool on price alone, read [why OpenSEO is open source](/open-source-seo) before you pick on features either.

## Speed makes bad choices cheaper to make

Ben is blunt about how far the new speed goes, and about what it produces when you take it at face value.

![A grid of sixty small white tiles on cream, every one of them carrying a thin orange fracture line. Headline: every SEMrush feature in three weeks, all of it shipped, all of it subtly wrong.](/blog/choosing-is-the-whole-job/slightly-broken-pileup.png)

> They'd all be so slightly broken that it would just be impossible to fix.
>
> Ben Senescu, on shipping every SEMrush feature in three weeks with Claude Code

Feature parity in three weeks, all of it subtly wrong, none of it debuggable. Notice that the failure is not a build failure. Everything ships. Everything looks finished. The damage only shows up later, once the volume is too large to audit.

![Quote card in the OpenSEO house style reading "They’d all be so slightly broken that it would just be impossible to fix," attributed to Ben Senescu, founder of OpenSEO.](/blog/choosing-is-the-whole-job/quote-slightly-broken_16x9.png)

Run the analogy over content and it holds exactly. You can generate ninety pages this week. If the cluster underneath them was chosen badly, you now have ninety pages that are individually fine and collectively pointless, plus an internal linking structure you have to unpick before you can fix anything. His answer was a [public roadmap](/roadmap) that names what is in and, by omission, everything that is out.

## The number that flatters you is not the number that pays you

Ben came into SEO in February, from software engineering rather than marketing. The advantage of arriving that late is that none of the industry's habits look load-bearing yet.

> A lot of people want to increase their domain rating, like that are entrepreneurs, because that's kind of what everyone talks about and what companies are marketing. Like, we'll buy you all these backlinks to increase your domain rating. But it's like, is that gonna get you any organic traffic?
>
> Ben Senescu, founder of OpenSEO

Domain rating is a third-party estimate of link graph strength. It correlates with traffic often enough to feel like a target and it moves in response to purchases, which is exactly the combination that makes a metric attractive and useless. It goes up when you spend. That is the whole appeal.

The useful version of that question is the one to put on every item in your backlog. Not "will this improve the score" but "which search demand does this capture, and is anybody in it buying". Our [backlink data](/features/backlink-checker) is there to show you who links to a competitor and why, not to give you a number to grow. When you want a defensible way to rank the candidates, [opportunity sizing](/library/keyword-research/opportunity-sizing-forecasting) puts volume, difficulty, and conversion value in one column so the ordering argues for itself.

## A flagged issue is not automatically a real issue

Before OpenSEO, Ben worked as the first employee at a company that built a coding agent to fix accessibility violations on Shopify stores. That history came back around when a user filed a bug against the OpenSEO [site audit](/features/site-audit): it was flagging Shopify themes for two H1 tags, and the browser deletes one of them at render time. The audit was right about the source and wrong about the page.

Every crawler you will ever run produces a list like that, hundreds of items long, sorted by severity rather than by consequence. Working the list top to bottom feels like progress and is mostly not. Two or three of those rows are costing you traffic. The procedure below is aimed at finding which ones.

## GEO is where choosing costs the most

Ask Ben where the answers run out and he goes straight to generative engines.

> With the Geo, it seems like there's a lot less definitive answer on how it works.
>
> Ben Senescu, founder of OpenSEO

His contrast is worth keeping. Keyword research he describes as essentially a solved problem, and backlinks as a matter of showing the backlinks. Both have a known shape, so building for them is an engineering question. GEO has no settled method, which means every hour spent on it is a bet rather than an execution.

That is not a reason to skip it. It is a reason to instrument it before you scale it. Track the prompts your buyers actually type with [AI search prompts](/features/ai-search-prompts), watch whether you get named in the answers with [AI brand visibility](/features/ai-brand-visibility), and accept that the reporting layer is thin on purpose. We wrote about how much Google already hides from you in [the dark query problem](/blogs/dark-queries); the answer engines are stingier still.

## The filter that survives the churn

![Quote card in the OpenSEO house style reading "Are you doing good marketing? Are you communicating your brand properly?" attributed to Ben Senescu, founder of OpenSEO.](/blog/choosing-is-the-whole-job/quote-good-marketing_16x9.png)

Ben expects the gap between an exploit and its patch to keep shrinking, because writing code got easy for attackers and detecting patterns got easy for the platforms. What he lands on is deliberately unglamorous.

> Are you doing good marketing? Are you communicating your brand properly?
>
> Ben Senescu, founder of OpenSEO

He also credits SEO with changing how he thinks about marketing generally. Coming from a background where marketing meant posting on LinkedIn or X and hoping, the discipline of starting from what people are actually searching for and actually asking gave him a framework for how to talk about the product at all. That framework outlives any particular ranking factor, which is the point. Pulling those phrasings out of real conversations rather than a database is covered in [seeding keywords from conversation](/library/keyword-research/seed-from-conversation).

## Do it with OpenSEO

The goal is to end the week with one item you chose on evidence, not ten you could have executed. Run this against a live project.

![Three-step cycle diagram. Step 1, collapse the backlog into candidates. Step 2, price each candidate against demand. Step 3, ship one and instrument it. A return arrow loops back to step 1, labelled "one item, chosen on evidence."](/blog/choosing-is-the-whole-job/the-selection-loop.png)

### 1. Collapse the backlog into candidates

Every open idea, audit finding, and content request in one list, each tagged with the query cluster it would serve. Anything you cannot attach to a cluster goes to the bottom.

### 2. Price each candidate against demand

Search volume, current position, and difficulty for the cluster, plus the honest question of whether the people in it buy. Candidates that only move a score get cut here.

### 3. Ship one and instrument it

Pick the top row, ship it, and set the check date before you start. If the metric you chose has not moved by then, that is information about your selection process rather than about the page.

### Full Prompt: Pick the One Thing

```text
Here is my backlog for [mydomain.com]: [paste every open SEO idea,
audit finding, and content request].

1. Collapse into candidates

Group these into distinct opportunities. For each one, name the keyword
cluster it would serve. Flag any item that cannot be tied to a cluster.

2. Price each candidate

For every cluster, pull search volume, keyword difficulty, and my current
positions. Add my Search Console impressions and clicks for those queries.
Mark any candidate whose only measurable outcome is a third-party score.

3. Rank and cut

Rank the candidates by likely revenue, not by traffic. Show me the top
three with the evidence for each, and list what you cut and why.

4. Set the check

For the number one candidate, name the single metric that should move,
the size of move that would count, and the date to check it. Output as a
document I can review.
```

The [SEO coach skill](/docs/skills/seo-coach) will argue back on the ranking if you ask it to, which is more useful than an agent that agrees with your ordering.

## What to do Monday morning

![Quote card in the OpenSEO house style reading "I can do anything, what’s the one thing I should do?" attributed to Ben Senescu, founder of OpenSEO.](/blog/choosing-is-the-whole-job/quote-one-thing_16x9.png)

Open your backlog and count the items you could ship today with an agent. Then count the items where you could name the number that would move and the date you would check it. The gap between those two counts is your actual problem, and it is not a capacity problem.

Ben's version of the discipline was to stop merging good work from real contributors because he could not verify what it would do to the product. Yours is smaller. Cut the list to the three candidates you can price, ship the top one, and check it on the date you set. The other seven will still be there, and by then you will know something about the first one that changes how you rank them.

[OpenSEO](https://openseo.so/) is an affordable, open-source SEO platform that keeps your ranking, keyword, backlink, and Search Console data in one place, so pricing a backlog runs as a prompt instead of an afternoon of spreadsheets.
