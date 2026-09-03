---
title: "Two Surfaces, Two Timelines"
description: "Getting recommended by an LLM is two separate problems on different clocks. One of them you cannot move this quarter. The other is a finite list of pages you can edit this week."
author: "Jeremy Rivera"
date: "2026-09-04"
---

Last August I published six markdown companion files so AI crawlers would have something cheap and clean to read on my podcast site. Then I ran a control test on my own server and found that unscriptedseo.com was returning 429 to GPTBot on every request, from the same IP that was serving a browser 200 eight times in a row.

I had spent a week optimising content for a door that was locked.

That is the argument of this post. Getting recommended by an LLM is two problems, they run on different clocks, and most of what gets sold as a solution addresses the half you cannot move.

If you want an agent to run the audits below, connect the [OpenSEO MCP](/docs/mcp) first so it can pull your live ranking and Search Console data.

## Table of Contents

## The two surfaces

An assistant names your product from one of two places.

The first is what the model already knows. That is where "everyone knows Ahrefs, Semrush, SE Ranking" lives. It is fixed at training time and updates on the model maker's schedule.

The second is what the assistant fetches while it answers you. That is a live read of the open web, and you can work on it today.

![A two panel diagram titled Two Surfaces, Two Timelines. The left panel, Training data, is greyed out and labelled years, no lever this quarter, describing where established tool names live. The right panel, Retrieved pages, is highlighted and labelled this month, entirely workable, describing a live index of roughly forty pages that decide any product category.](/blog/two-surfaces-two-timelines/two-surfaces-two-timelines.png)

OpenAI documents the second surface plainly, and the wording repays a close read:

> ChatGPT search typically rewrites your query into one or more targeted queries that it sends those providers.

Two things follow. Your page is not being matched against what the user typed, it is being matched against a rewrite you never see. And OpenAI states directly that ["placement is not guaranteed"](https://help.openai.com/en/articles/9237897-chatgpt-search), along with the precondition: to make a website eligible for inclusion, allow OAI-Searchbot to crawl it.

Google describes its own version, a [query fan-out technique](https://developers.google.com/search/docs/appearance/ai-features) that issues "multiple related searches across subtopics and data sources," and says there are no additional requirements to appear in AI Overviews or AI Mode.

Perplexity separates the two surfaces explicitly in its [bot documentation](https://docs.perplexity.ai/guides/bots). PerplexityBot exists "to surface and link websites in search results" and is "not used to crawl content for AI foundation models," while Perplexity-User fetches a page live during an answer.

The retrieval half comes down to a crawl, a rewrite, and a selection. You can be excluded at any of the three.

## The overlap nobody agrees on

The obvious next question is whether the pages that get cited are the pages that already rank. I went looking for a number and found three that disagree.

![A bar chart titled The Studies Disagree, showing the share of AI Overview citations that also rank organically: Ahrefs 38 percent from 863,000 SERPs, Surfer SEO 52 percent from 405,576 AI Overviews, seoClarity 56 percent from 362,000 queries. Below, a second comparison shows the same Ahrefs measure at 76 percent in July 2025 falling to 38 percent in March 2026.](/blog/two-surfaces-two-timelines/ai-overview-organic-overlap-studies.png)

[Ahrefs](https://ahrefs.com/blog/ai-overview-citations-top-10) put it at 38%, from 863,000 SERPs and 4 million citation URLs. [Surfer](https://surferseo.com/blog/ai-overviews-study/) measured 52% across 405,576 AI Overviews. [seoClarity](https://www.seoclarity.net/research/aio-rankings-overlap) reports 56% from the top 20, across 362,000 queries and 5.1 million citations.

I do not think any of them is wrong. They cut at different top-N thresholds on different days. The seoClarity study also reports that 94% of queries showed *at least one* overlap, which is a much weaker claim than the 56% figure and gets quoted as though it were the same finding.

The number that matters is none of those three. Ahrefs measured roughly 76% in July 2025 and 38% in March 2026 using their own method both times, and they attribute the fall to query fan-out. The overlap is a moving trend rather than a constant, so anything you build on a single overlap figure has a shelf life of about a quarter.

Where citations concentrate is steadier and more useful. Research by Tom Wells of Peec AI, [published through Wix Studio's AI Search Lab](https://www.wix.com/studio/ai-search-lab/research/content-types-most-cited-by-llms), examined 1,056,727 citations across 75,000 answers and found listicles are the most-cited format at 21.9%, rising to 40% on commercial-intent queries. For "what tool should I use," the roundups are the corpus.

## The half you cannot rush

So what about the training side? This is where I expected a number and did not find one.

The mechanism is well studied. *Dated Data*, from a Johns Hopkins team, shows that a model's [effective knowledge cutoff differs from its reported one](https://arxiv.org/abs/2403.12958), because CommonCrawl dumps carry meaningful amounts of older data and deduplication is imperfect. The boundary is fuzzy. That work does not tell you how long a new brand takes to cross it.

As far as I can tell, nobody has published that figure. If you see a confident claim that it takes two years to enter the training data, ask where the number came from.

What does exist is a control condition inside a paper about something else. Hyunseok Paeng's ["Injection Paradox"](https://arxiv.org/pdf/2606.09204), accepted at the ICML 2026 FAGEN workshop, needed a product with low brand recognition and chose the Edifier NeoBuds Pro 3. The line I keep returning to sits in the methodology: the product received **0 out of 100 recommendations from both GPT-4o-mini and Haiku when no corpus was provided**. Given a retrieval corpus, the same product reaches a 54% baseline in Claude Opus.

That is a control result rather than the paper's headline, so I am careful about how much weight it carries. It is still the cleanest published demonstration I have found that for a product a model does not already know, retrieval is not an advantage on top of recognition. It is the whole route.

## The court drew the same line

The distinction has become load-bearing enough to turn up in the remedies opinion in *United States v. Google*. Judge Mehta ordered Google to make search index and user-interaction data available to qualified competitors, and in weighing publisher remedies the court considered letting publishers opt out of crawling "for inclusion in Google's search index and for training its GenAI models and products."

Index and training, named separately, as two things a publisher might refuse independently. Google's own patent for [generative summaries](https://patents.google.com/patent/US11769017B1/en) describes selecting result documents using "query-dependent measure(s), query-independent measure(s), and/or user-dependent measure(s)" and then linking back to the documents that verify the summary.

The industry is still arguing about whether these are one surface. The court and the patent office already treat them as two.

## Check the door first

Which brings me back to my own server, and to the check almost nobody runs.

![A two panel comparison titled Refused at the Door. Left panel, browser user agent, 200, eight requests back to back, every one served, X-Powered-By PHP header present. Right panel highlighted, GPTBot user agent, 429, four requests 45 seconds apart after a two minute cooldown, no X-Powered-By header. Caption notes six sibling sites on the same host served GPTBot 200 under the identical test.](/blog/two-surfaces-two-timelines/gptbot-user-agent-block-test.png)

Same IP. Browser user agent, eight requests back to back, 200 every time. GPTBot user agent, four requests spaced 45 seconds apart after a two minute cooldown, 429 every time. So this was not rate limiting.

The detail that settles it: the 429 carried no `X-Powered-By` header and the 200 did, so PHP never ran. The request was refused at the LiteSpeed edge before WordPress saw it. It was not in robots.txt, not a plugin, not `.htaccess`, and six sibling sites on the same host served GPTBot 200 under the identical test.

I had been publishing companion files for AI crawlers on a site that refused the crawler at the door. The static `.md` files still returned 200, because they never touch PHP, which was a useful accident rather than a plan.

You cannot be selected from a set you were never admitted to. This is the one part of the stack that is binary, cheap to test, and almost never tested.

## TL;DR

- Getting recommended is two problems. Training data is a multi-year brand problem. Retrieved pages are a finite list you can work this month.
- All three major vendors document the retrieval half. OpenAI says outright that placement is not guaranteed and that crawl access is the precondition.
- Citation-to-organic overlap is measured at 38%, 52% and 56% by three credible studies, and the same team's figure fell from 76% to 38% in eight months.
- Listicles are 21.9% of all citations and 40% on commercial queries.
- For a brand the model does not know, retrieval is the only route, not an edge.
- None of it matters if you are returning 429 to the crawler.

## Homework

1. **Test your own door.** Curl your site with each AI crawler's user agent and with a browser user agent, from the same IP, interleaved. Compare headers as well as status codes. `X-Powered-By` told me more than the 429 did.
2. **Build the retrieval corpus.** Pull the top twenty pages for the two or three questions a buyer actually asks, phrased the way a person asks them. "Best SEO tools for beginners" and "cheapest SEO tool" retrieve different pages.
3. **Mark where you already appear**, and split the list into present, absent, and present-but-wrong. Present-but-wrong, where your pricing or description is stale, is the fastest fix and nobody looks for it.
4. **Write the sentence that earns your slot** for every page you are absent from. If you cannot write one, that page is not a target.

### Full Prompt: Build the retrieval gap list

```
Using the OpenSEO MCP, for each of these buyer questions:
  - <question 1>
  - <question 2>
  - <question 3>

1. Return the top 20 ranking URLs for each.
2. For each URL, fetch the page and report whether <my product> is mentioned,
   and if so quote the exact sentence and note the stated price.
3. Flag any mention where the price or description is out of date.
4. Produce one table: URL, ranks for, mention status, stale claim, contact path.
5. Sort by ranking position, best first.
```

Optimising content while the crawler gets a 429 is an expensive way to feel productive.

---

*Sources are linked inline. First-party crawler data is from my own servers, August 2026. The panel referenced here was recorded 28 August 2026 for The Unscripted SEO Interview Podcast with [Patrick Stox](https://unscriptedseo.com/patrick-stox-on-building-in-the-geo-era/), Ben Senescu of OpenSEO, and [Ben Wills](https://unscriptedseo.com/ben-wills-one-word-prompt-llm-testing/) of OppAlerts. Every cited URL was verified on 2 September 2026.*
