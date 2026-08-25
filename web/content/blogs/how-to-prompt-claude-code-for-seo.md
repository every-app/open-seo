---
title: "How to Prompt Claude Code for SEO"
description: "Treat Claude Code like an SEO expert with infinite patience: ask every question, give it every idea, and control it so it serves your marketing strategy."
author: "Ben Senescu"
date: "2026-08-19"
---

One of the most frequently asked questions I get is how to take advantage of Claude Code for SEO.

Most people asking are nervous about doing it right. But Claude Code is so good now that you should treat it like you have an SEO expert with infinite patience. Ask it every question. Give it every idea you have.

Your job is to control that expert, and make sure what it does serves your marketing strategy.

SEO is a deep topic. But working on it in tandem with your agent is much simpler than trying to read up on SEO first. Ask your questions, talk through your ideas, and refine from there.

## A 60-second example

> **You:** My site gets decent traffic but almost no signups. What should I look at?
>
> **Claude:** Six things worth checking: search intent mismatch, page titles, content gaps, internal links, page speed, backlinks...
>
> **You:** Which one of those actually moves signups for a two-person company, and what's the trade-off?
>
> **Claude:** Intent mismatch. Most of your traffic comes from how-to queries, and those readers were never going to sign up. The catch is that fixing it means writing for smaller, buyer-intent keywords, so your traffic number drops while your signups go up.

The first answer is a list of ideas. The second is a decision you can act on.

## How to set up Claude Code for SEO

Two commands in Claude Code install the OpenSEO MCP server and all nine SEO agent skills:

```
/plugin marketplace add every-app/open-seo
/plugin install openseo@openseo
```

Codex CLI has [its own plugin](/docs/codex-plugin), and any other MCP client, Cursor included, can [connect directly](/docs/mcp).

## Why do I need to pay for SEO data?

Without a data source, an agent will invent search volumes that sound plausible and are wrong. Real numbers make everything below work.

To acquire this data, someone has to crawl the whole internet and store everything people are searching for on Google. That's expensive, and it's why the big SEO suites run $100 a month and up.

OpenSEO is $10 a month with $10 of usage credits included, and signing up is free with $0.50 of trial credits. Asking Claude questions costs nothing beyond your normal Claude usage. You only spend credits when the agent pulls real data, and a keyword lookup runs about five cents. Search Console data never costs credits, because it's your own data.

## Your first SEO prompt

Don't start by studying what the tools do. Ask:

> What SEO skills do you have installed, and which should we use for my situation?

The skills are packaged workflows for things like audits, keyword research, and link prospecting, and Claude will pick the right one and explain why. If it says it doesn't have any, run the two install commands above and ask again.

## SEO prompts for Claude Code

The example prompts below read like speech because we dictate ours. A rambling voice memo carries more context than a carefully typed line, and transcription typos don't matter. [Wispr Flow](https://wisprflow.ai) and [superwhisper](https://superwhisper.com) both do this well, and [Handy](https://handy.computer) and [FluidVoice](https://github.com/altic-dev/FluidVoice) are open source.

**Push back on every recommendation.** Claude will give you lots of ideas. Make it show its work: the reasoning, the trade-off, and the one thing that matters most.

> You gave me six options. Which one actually makes a difference for the business, and what's the best argument against it?

**Give it every idea you have.** Half-formed is fine. It's much cheaper to have your expert poke holes in an idea than to build the wrong thing.

> I have an idea: what if we made a comparison page for every competitor in our space? Poke holes in that before we commit to anything.

**Describe your positioning in your own words.** Who your product is for, who it isn't for, and what makes someone pick you. Two sentences of that will steer keyword research better than any settings page.

> We're better for solo founders who live in their code editor. The big suites are built for agencies with a full-time marketing team. Find keywords where OUR buyer is searching.

**Name the deliverable, not the steps.** Say what done looks like and let Claude figure out how to get there.

> Audit my site and give me the one thing worth doing this week, not a list of forty issues.

**Show, don't describe.** A screenshot of a weird-looking page or a confusing report is a complete prompt. And if it's heading the wrong direction mid-task, interrupt it. You won't offend it.

## How to get clarity from Claude

You can't really mess this up:

- **Confused?** Say "explain that like I'm new to SEO." That question is free and it never gets impatient.
- **Skeptical?** Ask "what data would prove this is working?" and have it check your own Search Console numbers.
- **Worried about breaking something?** Asking questions and pulling data changes nothing on your site. When Claude Code does edit something, it shows you the change first, and SEO changes are mostly text you can revert.

You are not being graded on your prompts. A dumb question costs you a few seconds, and so does asking the same one twice.

## How to get started with SEO in Claude Code

Dictate a paragraph about your business: what you sell, who buys it, and what you want from search. Then ask:

> Given all that, what should we look at first, and why that instead of the alternatives?

Ten minutes later you'll have a short, prioritized list and the reasoning behind it. Push back on it, then refine from there.

That works with or without OpenSEO connected. With it, the answers come with real numbers attached.

## What each SEO skill does

If you ran the two plugin commands above, you already have all nine skills, and the Codex plugin installs the same set. Anywhere else, [connect MCP](/docs/mcp) first and then [add the skill files](/docs/skills/setup).

Each skill hands Claude a complete workflow. The ones you'll reach for most:

- [SEO Audit](/docs/skills/seo-audit) audits your site and returns a one-page, plain-language report built around a single next action.
- [Keyword Research](/docs/skills/keyword-research) finds keywords worth targeting and explains why each one fits your business.
- [Competitive Landscape](/docs/skills/competitive-landscape) maps who is winning across your market and where the openings are.
- [Link Prospecting](/docs/skills/link-prospecting) finds qualified outreach prospects and the angle that makes each one relevant.
- [Local SEO](/docs/skills/local-seo) audits a Google Business Profile, compares it to local competitors, and shows where you drop out of Google Maps around a location.

You don't have to memorize any of this. Ask Claude which one fits, or read the [skills docs](/docs/skills) for the full list.

## FAQ

### Do AI SEO agents actually work?

For the legwork, yes: keyword research, audits, rank tracking, and competitor analysis are data problems, and an agent with real data handles them well. What doesn't work is autopilot. Google's spam policies name scaled AI content generation directly, and no agent can hand you a strategy. The judgment stays with you; that's the whole setup this guide describes.

### Will AI replace SEO?

No, but it's changing where the answers show up. More searches end in an AI-written answer instead of ten blue links, and those answers cite sources. The work of being the source worth citing is still SEO: crawlable pages, content that answers the question, and a reputation other sites vouch for.

### Is SEO dead?

Search demand didn't die; it's spreading across Google, AI Overviews, and chat assistants. What died is the version of SEO where you stuff keywords and wait. The questions that decide whether you get found, and now whether you get cited, are the same ones your agent can help you answer.

### Can I do SEO myself?

Yes, and that's the point of working this way. The parts that used to require an expensive expert, reading the data, spotting the priority, knowing what to check next, are exactly what the agent is good at. You bring the knowledge of your own business, which no agency has anyway. Once the business takes off, hiring an SEO expert can be worth it, but you don't need one to get started.

### How much does SEO cost?

Your time, plus data. The data runs $10 a month with [OpenSEO](/pricing), $100 and up with the big suites, or a $50 minimum deposit with a raw data provider if you [self-host](/open-source-seo). Content costs whatever your time is worth. You don't need an agency to start.

### How long does SEO take?

Months, not days. Google has to recrawl your pages, re-rank them, and build trust, so expect the first movement in weeks and real results in three to six months. That's why the method here leans on weekly rank tracking and your own Search Console data: you want evidence it's working long before the traffic shows up.

### Is SEO worth it for a small business?

It's worth it if your customers search for what you sell. Spend ten minutes checking before you invest: look up the keywords you'd want to rank for, and see whether there's volume and who currently holds the results. If nobody searches for your category, put the effort into another channel and revisit later.
