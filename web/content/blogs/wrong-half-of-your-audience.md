---
title: "Ranking for the Wrong Half of Your Audience"
description: "Search intent has four buckets, and none of them tell you which customer you meant. Audit a keyword list by audience before you map it by temperature."
author: "Jeremy Rivera"
date: "2026-07-31"
---

Alex Zweydoff niched his agency into one industry on day one: property management, out of Orlando. Clients keep arriving with the same chart, where traffic and form fills both climb and no new business closes.

He can call the diagnosis before the audit finishes. Whoever built the site optimized it for tenants.

> They can throw a rock and hit ten tenants at the same time. They need owners who are looking for a trusted property manager.
>
> Alex Zweydoff, ClearLead Digital

A property manager fills a vacancy without help from you. Zillow does that. The money comes from owners handing a property over to manage, so Alex scores his accounts on doors added to the client's portfolio, meaning signed management contracts. Tenant traffic can hit every target in the SEO report and move that number by zero.

Both audiences search for property management and land on the same contact form, and only one of them pays.

If you want an agent to run the audit below, connect the [OpenSEO MCP](/docs/mcp) first so it can pull your live ranking and Search Console data.

## Table of Contents

- [The variable intent mapping leaves out](#the-variable-intent-mapping-leaves-out)
- [Three stages of owner intent](#three-stages-of-owner-intent)
- [The rungs above the stages](#the-rungs-above-the-stages)
- [Do it with OpenSEO](#do-it-with-openseo)
- [What to do Monday morning](#what-to-do-monday-morning)

## The variable intent mapping leaves out

Sort "rental homes in Baldwin Park" and "property management companies Baldwin Park" through the standard four-type model and both come back commercial. Run them through the hot, warm, and cold map in our [search intent guide](/library/keyword-research/search-intent-mapping) and both look warm. That model describes what a searcher wants to do. It carries nothing about who the searcher is, and in a two-sided business that variable decides whether the click has any value at all.

![OpenSEO keyword research results for property management in Orlando, where the intent column labels both tenant queries and owner queries as commercial, with an added audience column marking each row tenant or owner](/blog/wrong-half-of-your-audience/audience-intent-table-openseo.png)

Any company with a supply side and a demand side inherits the problem. Recruiters and candidates. Hosts and guests. The keyword database cannot see the split, because both sides reach for the same nouns.

## Three stages of owner intent

Alex breaks the paying side into three stages, and the phrasing matters because it came off sales calls rather than out of a tool:

1. An owner is thinking about renting out a property.
2. An owner is unhappy with the manager they have.
3. An owner should have hired a property manager two weeks ago.

Those stages port to any service business. Someone weighing up the category, someone leaving a competitor, and someone in the middle of an emergency need different pages. The middle group tends to be the most profitable and the least targeted, because almost nobody writes for a customer who already bought from somebody else.

## The rungs above the stages

Alyssa Evans runs growth strategy for fintech and SaaS companies, and she has dropped the funnel shape for what she calls a content ladder.

> You want to make sure that you're found at that very base level and working their way up. So as they get more information and it's more complicated, then they ask more questions, and then you're also showing up on that next level.
>
> Alyssa Evans, Grow Your Strategy

Her reason for the shape is the answer layer. People type long questions into ChatGPT, so in her words "you can't just do one or two words anymore," and the base rung of most ladders now gets answered before anyone opens a browser tab. Skip the rungs above the base and the LLM handles the beginner question while a competitor takes the follow-up.

Stack Alyssa's ladder on Alex's stages and the output is a grid instead of a list. Every cell holds one audience at one rung. Alex takes his grid below the metro into sub-communities, because an owner in Orlando searches Baldwin Park, the neighborhood, and not the city. The volume in those cells is thin and the competition for them is thinner, since the agencies chasing the metro term left them empty.

![A three by three grid of owner buying stages against content ladder rungs, with two cells filled to show existing pages and seven left empty](/blog/wrong-half-of-your-audience/audience-rung-grid-openseo.png)

## Do it with OpenSEO

No keyword tool can label audience for you. That label lives in your sales calls, not in a database, so pull the vocabulary each side uses from your own recordings first. Our [seed keywords guide](/library/keyword-research/seed-from-conversation) covers the extraction. Then hand your agent the labels and let it sort what you already rank for.

### 1. Label the existing footprint

Every ranked keyword for the domain, tagged by audience, then by stage within the paying audience.

### 2. Measure the split

The share of your rankings, impressions, and clicks belonging to the side that never buys. On inherited accounts, Alex finds this number ugly.

### 3. Find the rebuild list

Paying-audience queries sitting in positions 11 to 30 are already halfway up. Those pages come first.

### Full Prompt: Audit by Audience

```text
My business serves two audiences: [A, who pays me] and [B, who does not].
Here is how each one describes their problem in their own words: [paste].

1. Label the footprint

Pull every keyword [mydomain.com] ranks for in positions 1-50. Label each
one A, B, or ambiguous. For the A keywords, add a buying stage: weighing
up the category, leaving a competitor, or urgent.

2. Measure the split

Report the share of my ranking keywords, impressions, and clicks that
belong to audience B. Then list my top 10 pages by traffic and name the
audience each page was written for.

3. Find the rebuild list

Show me the A keywords where I rank 11-30, sorted by the buying stage I
have the thinnest coverage for. Output as a document I can review.

```

The keyword research runs the same way it always did. The [keyword research skill](/docs/skills/keyword-research) handles the mining, and the audience labels ride on top of it as one extra column.

## What to do Monday morning

Open your five highest-traffic pages and name the customer each one was written for. If two of them answer to the audience that does not pay, you have your explanation for why the traffic line and the revenue line stopped agreeing.

Then run the prompt against the rest of the site. The number to watch is the share: how much of your organic footprint you built for people who were never going to buy from you. Alex's clients keep finding that their best page by every metric in the report was written for the customer who does not buy, which reorders the content calendar before a single new keyword gets mined.

[OpenSEO](https://openseo.so/) is an affordable, open-source SEO tool that connects your ranking, keyword, and Search Console data in one place, so an audit like this runs as a prompt instead of a spreadsheet afternoon.
