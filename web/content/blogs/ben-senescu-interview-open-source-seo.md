---
title: "Ben Senescu on Open Source, $10 SEO, and 60 Open Pull Requests"
description: "OpenSEO's founder arrived in SEO in February 2026 from software engineering. An edited transcript of his conversation with Jeremy Rivera about pricing, community contributions, domain rating, and the features he decided not to build."
author: "Jeremy Rivera"
date: "2026-08-17"
---

![Article header in the OpenSEO house style. Eyebrow reading OpenSEO, The Interview, above the headline "Ben Senescu on Open Source, $10 SEO, and 60 Open Pull Requests" and a motif of alternating short question bars and long answer bars.](/blog/ben-senescu-interview-open-source-seo/header.png)

Ben Senescu is the founder of OpenSEO, an open-source SEO platform he started building in February 2026. He is a software engineer by background and, by his own description, still fairly new to SEO. He joined Jeremy Rivera on the Unscripted SEO Podcast to talk about how the project began on a Reddit thread, why open source does not mean free, what happened when sixty pull requests arrived from people he had never met, and which parts of SEO he has decided OpenSEO will not try to solve.

The exchange below is condensed and edited for clarity. Every line inside quotation marks is verbatim from the recording. Both [OpenSEO](https://openseo.so/) and its [MCP server](/docs/mcp) are free to inspect.

## Table of Contents

- [Why should anyone trust a builder this new to SEO?](#why-should-anyone-trust-a-builder-this-new-to-seo)
- [Open source does not mean free, correct?](#open-source-does-not-mean-free-correct)
- [Who is actually paying, if not professional SEOs?](#who-is-actually-paying-if-not-professional-seos)
- [What does open source mean here in practice?](#what-does-open-source-mean-here-in-practice)
- [What are the hard lessons so far?](#what-are-the-hard-lessons-so-far)
- [What did you work on before this?](#what-did-you-work-on-before-this)
- [What does the landscape look like to a newcomer?](#what-does-the-landscape-look-like-to-a-newcomer)
- [Depth or breadth for the next year?](#depth-or-breadth-for-the-next-year)
- [How should people get involved?](#how-should-people-get-involved)
- [What Ben Senescu is actually arguing](#what-ben-senescu-is-actually-arguing)

## Why should anyone trust a builder this new to SEO?

I am actually fairly new to SEO. Before OpenSEO I was building other open-source projects and I wanted to start doing SEO for them, so I went looking at the tools. They were all complicated, bloated, and too expensive for me as a solopreneur.

While I was researching alternatives I found that lots of people were vibe coding their own dashboards on top of the DataForSEO API. So I posted in r/TechSEO and asked whether people would want an open-source project they could start from instead. Enough of them said yes that I spent a week building the first version and posted it. The response was strong, and I have been working on it ever since. That was February. Five months later it is a genuinely robust piece of software, and I would call myself an intermediate SEO now, mostly from talking to customers and working feature requests.

## Open source does not mean free, correct?

Correct. OpenSEO is not free. You need either your own DataForSEO API key or you pay us $10 a month and use the hosted platform.

The reason is the thing every professional SEO asks first, which is: what about the data? Everyone knows the data is expensive. That data costs money, and the way we make money is a small fee on top of what you use. It still works out significantly cheaper than the big suites. Most of our customers never go past $10 a month. If you are an agency with a hundred clients spending a thousand dollars a month on software, you might get away with fifty dollars a month on OpenSEO, because you get unlimited projects and you pay for what you use. That model is the whole argument for [why OpenSEO is open source](/open-source-seo).

## Who is actually paying, if not professional SEOs?

When I first posted on Reddit it was mostly professional SEOs, and they wanted an open-source alternative so they could customise their own tools. But the people paying for the hosted version turned out not to be professional SEOs at all. They are not comparing us to SEMrush, because they have never used SEMrush. It was inaccessible to them at that price point.

And it was not only the price.

> It's really hard to do SEO. Like it took lots of time. You need to like spend like 10, 20 hours a week doing it.
>
> Ben Senescu, founder of OpenSEO

Now those people can start dipping their toes into SEO with Claude. Before, an affordable SEO tool "didn't make any sense because you were gonna spend so much time doing it anyway." Now it makes more sense.

![Two-row comparison in the OpenSEO palette. The row labelled "Doing the work" shrinks from a full bar marked "10 to 20 hours a week" before agents to a sliver marked "a prompt" with agents. The row labelled "Choosing the work" is the same length in both columns. A footnote marks the chart as illustrative apart from the 10 to 20 hours figure.](/blog/ben-senescu-interview-open-source-seo/cost-of-doing-vs-choosing.png)

## What does open source mean here in practice?

The code is totally available for anyone to use. You can pull our code down, open it in a folder with Claude, and say "add me this feature," and it will add whatever you want or change anything about the app. If you want an integration we do not support, you can have Claude build it on your own computer so it works exactly how you want.

You could do all of that from scratch, but I have spent five months making sure this particular codebase works well. My background is as a software engineer, so there is a lot of design-pattern work in there: you add one feature, you do it properly, and the next feature is easier to add.

It is also community driven. There are about fifty issues open right now, people requesting features or bug fixes, which makes it easy to contribute and fix paper cuts. One contributor put up a whole content optimisation page as a pull request. It is not something we necessarily want in the main product right now, but he was able to publish and share it and it got good engagement.

## What are the hard lessons so far?

Resisting the temptation to just release things is certainly real. OpenSEO has picked up a lot of attention over the last month in particular.

![Large orange numeral 60 beside the line "Senescu stopped merging community pull requests and published a roadmap instead," with a row of supporting figures: 50 open issues, 5 months of building, 1 maintainer, February 2026 started building.](/blog/ben-senescu-interview-open-source-seo/sixty-open-pull-requests.png)

> I'm sure most of the PRs are really good, but I I can't just like add a hundred things to the app all at once because I'm certain even if only one of them breaks, it's like how do you track that all down?
>
> Ben Senescu, founder of OpenSEO

So he declared bankruptcy on the queue and published a [roadmap](/roadmap) in its place. His illustration of the alternative is the part worth keeping: he could probably implement every feature in SEMrush in about three weeks with an AI coding agent.

![A grid of sixty small white tiles on cream, every one of them carrying a thin orange fracture line. Headline: every SEMrush feature in three weeks, all of it shipped, all of it subtly wrong.](/blog/ben-senescu-interview-open-source-seo/slightly-broken-pileup.png)

The failure he is describing is not a build failure. Everything ships, and everything looks finished.

![Quote card in the OpenSEO house style reading "They’d all be so slightly broken that it would just be impossible to fix," attributed to Ben Senescu, founder of OpenSEO.](/blog/ben-senescu-interview-open-source-seo/quote-slightly-broken_16x9.png)

Which is how he arrives at the question he now runs everything through.

![Quote card in the OpenSEO house style reading "I can do anything, what's the one thing I should do?" attributed to Ben Senescu, founder of OpenSEO.](/blog/ben-senescu-interview-open-source-seo/quote-one-thing_16x9.png)

## What did you work on before this?

In college I started a Patreon for musicians. We worked on it for two years, got about ten artists using it, and then shut it down, but it was a great experience. After that I worked at Klaviyo, one of the biggest email marketing companies for Shopify stores, and learned a huge amount there because of the number of smart people to learn from.

Then I moved to another company in the e-commerce space where I was the first employee, which was a good trial run at being a founder. That company built a coding agent to fix accessibility violations on Shopify stores. The same rules that make restaurants put in ramps apply to the web: images and links have to be labelled properly.

That history came back around. A user recently raised an issue against the OpenSEO [site audit](/features/site-audit) that was exactly the problem we used to deal with.

> it'll render two H1 tags, and then it when it renders in the browser, it deletes one. So we were flagging it as a violation, even though it's not like technically one.
>
> Ben Senescu, on the Shopify H1 false positive

## What does the landscape look like to a newcomer?

It is really crazy. There are so many takes online and it has been interesting trying to parse them all. Domain rating is one I have had to wrap my head around.

> a lot of people want to increase their domain rating, like that are entrepreneurs, because that's kind of what everyone talks about and what companies are marketing. Like, we'll buy you all these backlinks to increase your domain rating. But it's like, is that gonna get you any organic traffic?
>
> Ben Senescu, founder of OpenSEO

That is the reason our [backlink data](/features/backlink-checker) is built to show you who links to a competitor and why, rather than to hand you a score to grow. If you want a defensible way to rank what to do about it, [opportunity sizing](/library/keyword-research/opportunity-sizing-forecasting) puts volume, difficulty and conversion value in one place.

The generative side is the interesting one. With traditional SEO it is pretty clear what he should be building: "keyword research is like essentially a solved problem. Backlinks, you just show the backlinks."

> With the Geo, it seems like there's a lot less definitive answer on how it works.
>
> Ben Senescu, founder of OpenSEO

He plans to prioritise it more over the next six months. In the meantime, [AI search prompts](/features/ai-search-prompts) tracks the prompts buyers actually type and [AI brand visibility](/features/ai-brand-visibility) tracks whether you get named in the answers. The reporting layer is thin for the same reasons we set out in [the dark query problem](/blogs/dark-queries).

## Depth or breadth for the next year?

More horizon. I posted the roadmap at the same time as saying I am not taking external pull requests, because getting through the roadmap is the reason I am not taking them. That is things like local SEO, improved AI visibility, prompt tracking.

I want to give people all of the data they need so that Claude can do things on their behalf. And I want OpenSEO to stay the tool people use when they are getting into SEO for the first time: business owners who cannot afford to hire an SEO consultant yet, and this is their entry point. So the interface stays simple, but with more advanced skills and data underneath for agencies and freelancers building their own workflows.

![Two-column roadmap graphic. On the roadmap: local SEO, improved AI visibility including prompt tracking, all the data an agent needs, a simple entry point for first-time SEOs, advanced skills and data for agencies. Explicitly not: external pull requests for now, and novel SEO analysis no other tool has.](/blog/ben-senescu-interview-open-source-seo/roadmap-in-and-out.png)

Going deep on new SEO insights nobody else has, we will probably leave to other products. OpenSEO is more the source of truth for your data: rank tracking, prompt tracking, the brain your agent works from. Pull in other tools for the advanced analysis.

## How should people get involved?

LinkedIn and X, under my own name, though I talk more about programming than SEO there. And join the Discord.

We are not taking external pull requests right now. We probably will in the future, but the best way to contribute is to write really good issues, describing what you want and how you want OpenSEO to work. Helping other people in the community and sharing what you find useful is just as valuable.

## What Ben Senescu is actually arguing

Two things run underneath the whole conversation, and neither is really about tooling.

The first is that arriving late is an advantage, because none of the industry's habits look load-bearing yet. Senescu is not attached to domain rating because he never had to be.

![Quote card reading "Are you doing good marketing? Are you communicating your brand properly?" attributed to Ben Senescu, founder of OpenSEO.](/blog/ben-senescu-interview-open-source-seo/quote-good-marketing_16x9.png)

The second is what he expects to still matter after the churn. He thinks the gap between an exploit and its patch keeps shrinking, because writing code got easy for attackers and pattern detection got easy for the platforms.

> Are you doing good marketing? Are you communicating your brand properly?
>
> Ben Senescu, founder of OpenSEO

He also credits SEO with changing how he thinks about marketing generally. He used to think of it as posting on TikTok, LinkedIn or X and hoping. Starting instead from what people are searching for and asking gave him a framework for how to talk about the product at all, which is the habit behind [seeding keywords from conversation](/library/keyword-research/seed-from-conversation). If you want an agent that argues back on your own priorities rather than agreeing with them, the [SEO coach skill](/docs/skills/seo-coach) is built for that.

[OpenSEO](https://openseo.so/) is an affordable, open-source SEO platform that keeps your ranking, keyword, backlink and Search Console data in one place.
