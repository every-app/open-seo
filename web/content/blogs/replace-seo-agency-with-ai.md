---
title: "How Importivity Replaced Its $3,000-a-Month SEO Agency With an OpenSEO Fork"
description: "Importivity's CTO forked OpenSEO and built a content engine on top of it. Organic clicks grew about 7x in six months, and they stopped paying their SEO agency."
author: "Ben Senescu"
date: "2026-10-15"
---

[Importivity](https://importivity.com) helps US companies move their supply chains to China, Vietnam and Mexico. [Moazzan Ishfaq](https://moazzanishfaq.com) runs all of the tech there as CTO, including SEO. Six months ago he forked OpenSEO and built a content engine on top of it. Organic clicks have grown about 7x since then, and Importivity stopped paying the SEO agency that had been costing it $3,000 a month.

If you're technical, you may have considered building your own SEO workflow on top of an SEO data API like DataForSEO. Here's why Moazzan forked OpenSEO instead, how he uses it, and what he built on his fork.

## From agency web developer to CTO

Moazzan started at a US digital marketing agency in 2023 as its website developer. Part of the job was managing the SEO side, including an outside SEO agency they paid about $3,000 a month, and he couldn't tell what it was doing. So he learned SEO himself. About a year and a half later he was CTO.

In late 2023 the agency had paying SEO clients, so it tried to build its own SEO tool. They hired two developers and gave it three months. It didn't work, partly because the AI models at the time weren't good enough.

The founders later sold the agency and started Importivity, where Moazzan took over the tech.

## Why he forked OpenSEO instead of building on Semrush

At Importivity the team used Semrush in the browser. Semrush had the data, but there was no way to add features or build workflows on top of it.

OpenSEO already had the parts every SEO team needs: keyword and ranking data, rank tracking and the Search Console connection. Those are the parts his old agency spent three months trying to build. Forking it meant Moazzan could spend his time only on what was specific to Importivity.

He hasn't pulled our updates since he forked. Whenever he needed something, he built it himself.

## The AI content engine he built on the fork

Moazzan's view is that, apart from technical fixes, SEO comes down to doing the same work consistently every week. His fork automates the content side in four pieces.

### Checking existing rankings before suggesting a topic

When Importivity used AI to suggest blog topics, it didn't check what the site already ranked for. They ended up with several posts competing for the same keywords.

Now the engine checks whether Importivity already ranks for a keyword, even weakly, before it suggests a topic. He also added an Opportunities tab with two lists: keywords Importivity ranks weakly for, and keywords competitors rank for where Importivity doesn't rank at all. New posts start from there.

### One click to draft, design and schedule a post

Publishing used to take three people: a writer, someone to make the cover, and someone to post it. Now Moazzan picks a keyword from the Opportunities tab and clicks once. A writing agent trained on Importivity's style drafts the post, and a design agent trained on their cover style makes the image. He approves both, and the post goes onto a calendar that publishes it to the site. He writes a month of posts at a time.

### Current tariff and duty facts in every post

The early AI drafts had no facts in them. Importivity writes about tariffs and duties, and those change faster than any model's training data. So before drafting, the engine searches for the latest news on the topic and gives the writer those facts and figures to work from.

This is an under-discussed part of AI content systems. Done this way, the posts end up more current than the human-written ones Importivity used to pay for, because a writer researching by hand is slow and expensive, and nobody goes back to update a post every time a tariff changes. If your company knows a subject well, you can now publish all the content you wished you could write, instead of waiting on content writers.

### Change reports, 30-day locks and automatic reverts

Before this, his weekly routine was to ask an agent to analyze the site and fix things. Each run had no idea what the last one changed. It kept editing the same pages and sometimes reversed its own earlier edits.

Now every change writes a report, and the next run reads the earlier reports first and only works on pages the last run didn't touch. An edited page is also locked for 30 days, and the engine scores the change at 7, 14 and 30 days. If traffic improves, the change stays. If it drops, the engine reverts the page.

He got that idea from a video of someone beating Super Mario with a genetic algorithm, which spawned thousands of Marios and kept only the ones that scored well. _"At the end, you would have a version of Mario that just kills it,"_ he said. His engine does the same thing with page edits.

## Results: about 7x the organic clicks and no agency fee

- About 7x the organic clicks in six months.
- Importivity stopped paying its $3,000-a-month SEO agency.
- Publishing went from three people to one person approving drafts.
- Weekly agent runs stopped re-editing the same pages.

## Building a similar system with hosted OpenSEO

You don't need a fork to do most of this. OpenSEO doesn't natively edit your site or publish posts yet (it's planned), but you can connect your agent to your CMS alongside OpenSEO, for example with the [WordPress MCP adapter](https://github.com/WordPress/mcp-adapter) or the [Shopify AI Toolkit](https://github.com/Shopify/shopify-ai-toolkit). Then have your agent follow the same rules:

- Before your agent proposes a new post, have it check Search Console for pages that already get impressions for the topic.
- Ask for two opportunity lists: keywords you rank for in positions 11 to 50, and keywords competitors rank for that you don't. Keep your competitors in [project context](/docs/skills/seo-project-setup) so every session uses the same list.
- Have your agent save a [report](/docs/skills/seo-report) every time it edits a page, with the page's numbers before the edit, and read those reports before the next run. [Stop your SEO agent from undoing its own work](/blogs/seo-agent-change-log) has the prompts.

To try it, connect [OpenSEO MCP](/docs/mcp) to Claude Code or Codex. Hosted OpenSEO is $10 a month with $10 of usage included ([pricing](/pricing)).

## Takeaways

- You don't have to build the generic SEO parts yourself. Keyword data, rankings and Search Console already exist in OpenSEO, so Moazzan spent his time on the workflow specific to Importivity.
- Give an AI content system current facts before it writes. That's what makes the posts worth reading in a fast-changing topic.
- Give your agent a memory. Reports on every change, a 30-day lock and scoring at 7, 14 and 30 days stopped it from undoing its own work.
- Start with the data you already have: what you rank weakly for, and what competitors rank for that you don't.
