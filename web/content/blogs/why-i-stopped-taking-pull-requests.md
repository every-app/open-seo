---
title: "Why I Stopped Taking Pull Requests"
description: "I had sixty open pull requests from people I had never met, and no way to tell which ones were safe to merge. Here is why I closed the queue, published a roadmap, and what I am building instead."
author: "Ben Senescu"
date: "2026-08-17"
---

![Article header in the OpenSEO house style. Eyebrow reading From the Founder, above the headline "Why I Stopped Taking Pull Requests" and a motif of stacked pull request rows with an orange line cutting across the third one.](/blog/why-i-stopped-taking-pull-requests/header.png)

There were sixty pull requests open on OpenSEO, most of them from people I had never met, and I closed the door on all of them at once.

That is not how open source is supposed to work. Traditionally the community implements features for you or fixes bugs, you review the code, you merge. It is the best part of the model. But OpenSEO picked up a lot of attention over the last month, and sixty is not a review queue. It is a second job.

![Large orange numeral 60 beside the line "I stopped merging good work from real people and published a roadmap instead," with supporting figures: 50 open issues, 5 months of building, 1 maintainer, February 2026 started building.](/blog/why-i-stopped-taking-pull-requests/sixty-open-pull-requests.png)

## Most of those pull requests were probably good

That is the part that makes it hard. I am not turning away bad work. I am sure most of the PRs are really good. But I cannot add a hundred things to the app all at once, because I am certain that even if only one of them breaks, there is no way to track that down afterwards.

You do not get a build failure. You get an app that works, mostly, in a way you can no longer reason about. So I declared bankruptcy on the whole queue and posted a roadmap instead, which is the honest version of what I was going to do anyway.

## I could ship everything, and that is the problem

Here is the thing people underrate about this moment. I could probably implement every feature in SEMrush in about three weeks with an AI coding agent. Feature parity, in three weeks, by myself.

![A grid of sixty small white tiles on cream, every one carrying a thin orange fracture line. Headline: every SEMrush feature in three weeks, all of it shipped, all of it subtly wrong.](/blog/why-i-stopped-taking-pull-requests/slightly-broken-pileup.png)

None of that would be a build failure. That is what makes it dangerous.

![Quote card in the OpenSEO house style reading "They’d all be so slightly broken that it would just be impossible to fix."](/blog/why-i-stopped-taking-pull-requests/quote-slightly-broken_16x9.png)

Everything would ship. Everything would look finished. And the damage would only show up later, once the volume was too large to audit. Resisting that temptation is real, and it is not a discipline problem. It is the actual job now.

![Quote card in the OpenSEO house style reading "I can do anything, what's the one thing I should do?"](/blog/why-i-stopped-taking-pull-requests/quote-one-thing_16x9.png)

That is the biggest question in the AI era, and I do not think it is close.

## I came to SEO in February

I am a software engineer. I was building other open-source projects and I wanted to do SEO for them, so I went looking at the tools. They were complicated, bloated, and too expensive for me as a solopreneur.

While I was researching alternatives I found lots of people vibe coding their own dashboards on top of the DataForSEO API. So I posted in r/TechSEO and asked whether they would want an open-source project to start from. Enough said yes that I spent a week building the first version. I posted it, the response was strong, and I have been on it ever since. Five months later it is a robust piece of software, and I would call myself an intermediate SEO now, entirely from talking to customers.

## OpenSEO is not free, and I will not pretend otherwise

You need either your own DataForSEO API key or you pay us $10 a month for the hosted platform.

The first thing every professional SEO asks about an open-source SEO tool is: what about the data? Everyone knows the data is expensive. It costs money, and the way we make money is a small fee on top of what you use. That is the entire business model, and it is [why the code being open](/open-source-seo) does not make it free.

It is still significantly cheaper than the big suites. Most of our customers never go past $10 a month. An agency with a hundred clients spending a thousand dollars a month on software might get away with fifty on OpenSEO, because you get unlimited projects and you pay for what you use.

## The people paying me have never used SEMrush

When I first posted on Reddit it was mostly professional SEOs who wanted an open-source alternative so they could customise their own tools. That is not who is paying.

The people on the hosted plan are not professional SEOs. They are not comparing us to SEMrush, because they have never used SEMrush. It was inaccessible to them at that price point, and it was not only the price. It was really hard to do SEO. It took lots of time. You needed to spend ten or twenty hours a week doing it. An affordable SEO tool did not make any sense, because you were going to spend so much time doing it anyway.

![Two-row comparison in the OpenSEO palette. The row labelled "Doing the work" shrinks from a full bar marked "10 to 20 hours a week" before agents to a sliver marked "a prompt" with agents. The row labelled "Choosing the work" is the same length in both columns.](/blog/why-i-stopped-taking-pull-requests/cost-of-doing-vs-choosing.png)

Now those people can dip their toes in with Claude, so an affordable tool makes sense for the first time. That is the audience I am building for.

## Open source here means you can actually change it

The code is totally available. Pull it down, open it in a folder with Claude, say "add me this feature," and it will add whatever you want or change anything about the app. If you want an integration we do not support, have Claude build it on your own machine so it works exactly the way you want.

You could do that from scratch. But I have spent five months making this particular codebase good at being extended. My background is software engineering, so there is real design-pattern work in it: you add one feature, you do it properly, and the next feature is easier.

There are around fifty issues open right now, feature requests and bug fixes, which is where the community energy actually goes.

## Domain rating is the wrong number to chase

There are a lot of takes online and parsing them has been an education. Domain rating is the one I keep coming back to.

> a lot of people want to increase their domain rating, like that are entrepreneurs, because that's kind of what everyone talks about and what companies are marketing. Like, we'll buy you all these backlinks to increase your domain rating. But it's like, is that gonna get you any organic traffic?

It goes up when you spend. That is the whole appeal. Our [backlink data](/features/backlink-checker) exists to show you who links to a competitor and why, not to hand you a score to inflate. If you want to rank what to actually do, [opportunity sizing](/library/keyword-research/opportunity-sizing-forecasting) puts volume, difficulty and conversion value in one column.

## A flagged issue is not automatically a real issue

Before OpenSEO I was the first employee at a company that built a coding agent to fix accessibility violations on Shopify stores. The same rules that make restaurants install ramps apply to the web: images and links have to be labelled properly.

That came back around last week. Someone raised an issue against our [site audit](/features/site-audit) that was the exact problem we used to deal with. A Shopify theme renders two H1 tags and the browser deletes one at render time. We were flagging it as a violation even though it is not technically one.

Every crawler produces a list like that, sorted by severity rather than by consequence. Two or three rows on it are costing you traffic. The rest is noise you can work through all week and feel productive.

## GEO is where I have the least certainty

With traditional SEO it is pretty clear what I should be building. Keyword research is essentially a solved problem. Backlinks, you just show the backlinks.

> With the Geo, it seems like there's a lot less definitive answer on how it works.

That is not a reason to skip it. I am excited to prioritise it more over the next six months. But it means every hour spent there is a bet rather than an execution, so instrument it before you scale it: [AI search prompts](/features/ai-search-prompts) for the prompts your buyers actually type, [AI brand visibility](/features/ai-brand-visibility) for whether you get named in the answers. The reporting layer is thin, for the same reasons laid out in [the dark query problem](/blogs/dark-queries).

## What I am building, and what I am not

More horizon than depth. I posted the roadmap at the same time as closing the PR queue, because getting through the roadmap is the reason the queue is closed.

![Two-column roadmap graphic. On the roadmap: local SEO, improved AI visibility including prompt tracking, all the data an agent needs, a simple entry point for first-time SEOs, advanced skills and data for agencies. Explicitly not: external pull requests for now, and novel SEO analysis no other tool has.](/blog/why-i-stopped-taking-pull-requests/roadmap-in-and-out.png)

I want to give people all of the data they need so that Claude can do things on their behalf. I want OpenSEO to stay the tool you use when you are getting into SEO for the first time, especially business owners who cannot afford an SEO consultant yet. So the interface stays simple, with more advanced skills and data underneath for agencies and freelancers building their own workflows.

Going deep on SEO insights nobody else has, we will probably leave to other products. OpenSEO is the source of truth for your data and the brain your agent works from. Go elsewhere for the advanced analysis.

## If you want to help, write issues

We are not taking external pull requests right now. We probably will again in the future. Until then the best way to contribute is to write really good issues: describe what you want and how you think OpenSEO should work. Those are still enormously helpful. So is answering questions and sharing what you find in the Discord.

I am on LinkedIn and X under my own name, though I post more about programming than SEO.

## The thing that survives all of this

![Quote card in the OpenSEO house style reading "Are you doing good marketing? Are you communicating your brand properly?"](/blog/why-i-stopped-taking-pull-requests/quote-good-marketing_16x9.png)

Writing code got easy, and detecting patterns got easy for Google and ChatGPT at the same time. So the cycle between an exploit and its patch is going to close and close and close. I do not think you can build a strategy on the gap.

> Are you doing good marketing? Are you communicating your brand properly?

Put blinders on and do those two things and I think it works out in the end.

I am thankful to have landed in this industry, because even if the job of SEO changes a lot, it rewired how I think about marketing. I used to think marketing meant posting on TikTok or LinkedIn or X and hoping the right people saw it. Starting instead from what people are searching for and what they are asking is a far better framework for how to talk about your own product, which is the habit behind [seeding keywords from conversation](/library/keyword-research/seed-from-conversation). That framework outlasts any particular ranking factor.

Sixty good pull requests are still sitting there. I would rather ship a roadmap I can stand behind than a hundred features I cannot debug.

Adapted from my conversation with Jeremy Rivera on the Unscripted SEO Podcast. [OpenSEO](https://openseo.so/) is an affordable, open-source SEO platform. If you want an agent working against your live data, start with the [MCP server](/docs/mcp) and the [SEO coach skill](/docs/skills/seo-coach), and the [roadmap](/roadmap) is public.
