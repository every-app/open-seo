---
title: "Stop Your SEO Agent From Undoing Its Own Work: 5 Rules From Importivity"
description: "Weekly 'fix my SEO' agent runs re-edit the same pages and undo last week's work. Importivity's CTO fixed it with five rules you can copy today."
author: "Ben Senescu"
date: "2026-10-15"
---

If you ask [Claude Code](/blogs/how-to-prompt-claude-code-for-seo) or Codex to "analyze my site for SEO and fix things" every week, it will eventually start undoing its own work. Every run starts from zero. It doesn't know which pages it edited last week, whether those edits helped, or that the post it wants to write competes with a page you already have.

[Moazzan Ishfaq](https://moazzanishfaq.com) ran into all of this as CTO of [Importivity](https://importivity.com), an Austin company that helps US businesses move their supply chains to China, Vietnam and Mexico. He [forked OpenSEO and built an SEO engine on top of it](/blogs/replace-seo-agency-with-ai), and grew the site's organic clicks about 7x in six months. Along the way, Importivity fired the SEO agency it had been paying $3,000 a month.

His engine runs on five rules. You can set up most of them today without forking anything, using the change-log format and the two prompts below.

The prompts assume [OpenSEO MCP](/docs/mcp) is connected, so your agent can read Search Console and save reports. The [Claude Code](/docs/claude-code-plugin) and [Codex](/docs/codex-plugin) plugins set it up with all 12 skills.

## Why does my SEO agent keep redoing its own work?

Because nothing tells it what happened last time. Moazzan's example is the prompt "analyze my website for SEO and do all the fixes," run every week. "It would edit the same pages again and again," he said. "It won't take into consideration if the previous edit was better or not."

Moazzan ran into four problems:

- The agent re-edits pages before Google has reacted to the last edit, so you never learn whether either one worked.
- It reverses earlier work. "Sometimes it undoes the changes made by the previous audit."
- It proposes new posts for keywords you already rank for, so your pages compete with each other. At Importivity, "most of our blogs were competing for the same keyword."
- Its posts "did not have any facts in them, because AI just used to generate them randomly."

He fixed them with five rules:

1. Every change writes a report, and the next run reads it first.
2. An edited page is locked for 30 days.
3. Every change is scored at 7, 14 and 30 days, and losers get reverted.
4. Before proposing a new page, check what you already rank for, even weakly.
5. Before writing, pull the latest facts on the topic.

## 1. Every change writes a report

The other rules depend on this one. Every time Moazzan's agent changes the site, it writes a report. "The next time you're making an update, it would refer back to the previous report to make sure it's not conflicting with the previous one."

"Now I'm only targeting the pages that are not touched in the previous update, so everything has gotten really consistent," he said. Before, the AI "was just randomly auditing my site every week and making updates." He says it now works like an employee who checks the relevant pages every week.

We built OpenSEO's [project context](/docs/skills/seo-project-setup) for this exact problem. It stores your business, goals, competitors, key pages and a log of research already done, and agents read it before they start. When I showed it to Moazzan, he said, "It's exactly the same problem I was in." Giving an agent a memory it reads every run is one of the habits in [Skills, memory and the trace](/library/ai-agent-seo/skills-memory-and-the-trace).

But a research log entry is a one-line summary, and a change log needs baselines and check results. I told Moazzan he's on the right track: reports are the better home for this, and his report-per-change approach is where I want OpenSEO's reports to go.

Your agent saves a [report](/docs/skills/seo-report) to your OpenSEO project in one tool call, and the next run reads the summaries before it touches anything. Have each entry record what changed, why, a 28-day baseline, how to undo it and when the page unlocks. Reports don't have tags yet (I want to add them), so start every title with "Change log" and the date. Saving over a report replaces it with no version history, so have each run save a new one.

## 2. Lock a page for 30 days after it changes

Once Moazzan's system edits a page, that page is locked for 30 days. "If you make an update next week, it won't affect that page at all," he said.

Google has to recrawl and re-rank a page before anything moves in Search Console, so a page your agent rewrites every Monday never gets a clean read.

OpenSEO doesn't lock pages, and it doesn't natively edit your site yet. Your agent makes the edits through your CMS or repo, so the lock is a rule in your project context, and your change logs tell it which pages are off limits.

If your site lives in a git repo, give the agent a check it can't misremember. `git log --since="30 days ago" -- path/to/page` shows whether that page's file changed in the last 30 days.

## 3. Score each change at 7, 14 and 30 days

This rule came from a video Moazzan saw of someone beating Super Mario with a genetic algorithm. The program spawned thousands of Marios trying different moves, kept the ones that scored well and discarded the rest. Then it bred the best ones and went again. "At the end, you would have a version of Mario that just kills it."

In Moazzan's version, each page change is a Mario, and his engine checks it at 7, 14 and 30 days. "If it is performing well, we'll keep it. If the score declined, we'll kill the change and revert back to what it was previously."

To score a change, compare equal windows. Search Console's average position blends devices and countries, so [it has limits](/library/rank-tracking/search-console-vs-rank-tracker), but it's enough to compare a page with itself. Pull clicks, impressions and average position for the page for the 7 days after the change and the 7 days before it, then repeat at 14 and 30. Search Console runs about three days behind, so run each check a few days after its date.

The setup below makes the keep-or-revert call at 30 days, because a week of clicks on one page is noisy. Reverting is your agent's job, and the undo line in your log makes it quick.

## 4. Check what you already rank for before proposing a page

Importivity's AI kept suggesting topics without checking whether the site already ranked for them. "Even if we're ranking weakly, we should have taken that into account, which it does now," Moazzan said.

Weak rankings count, and two pages chasing the same query is [keyword cannibalization](/library/keyword-research/cluster-topical-hubs). A page at position 40 is still the page Google connects with that query on your site, and a second post on the topic leaves you with two weak pages competing with each other.

Search Console shows the queries your pages get impressions for, even at position 50. [Mining your own Search Console](/library/keyword-research/gsc-programmatic-discovery) covers how to find these. Before your agent proposes a page, have it pull the queries for the topic and the pages that show up for them. If one of your pages shows up, improve it instead, or wait if it's locked.

OpenSEO's ranked keywords tool gives a second view from DataForSEO's data, and the [Keyword Clustering skill](/docs/skills/keyword-clustering) maps keywords to existing or proposed pages.

## 5. Pull in current facts before writing

Moazzan's engine pulls the latest news on a topic before it writes. For a post about tariffs or duties, "we pull the latest news about it and feed them in."

OpenSEO doesn't write posts, so this rule lives in your project context with the others. Claude Code and Codex can search the web themselves, and the rule tells them to cite what they find. You still review the draft; [Human in the loop content](/library/ai-agent-seo/human-in-the-loop-content) covers what that review should catch.

## How to set this up in OpenSEO

Connect Search Console first. On hosted OpenSEO, click Connect Search Console and pick your property ([how the Search Console MCP works](/google-search-console-mcp)).

Then paste this into Claude Code or Codex once:

```
Add a custom section called "Change rules" to this project's OpenSEO context with this text:

1. Before changing anything, read every report titled "Change log" from the last 45 days.
2. Don't edit any page changed in the last 30 days.
3. Score each change at 7, 14 and 30 days: compare the page's Search Console clicks, impressions and average position with the same number of days before the change. At 30 days, mark it kept or propose a revert.
4. Before proposing a new page, check Search Console for any existing page with impressions for the topic. If one exists, improve it instead.
5. Before writing, search the web for the latest news on the topic and cite at least three specific, dated facts with links.
6. After any change, save a new report titled "Change log: YYYY-MM-DD". In the summary, write one entry per changed page in this format, then the results of any checks run today:

Page:
Changed: what changed, old vs new
Why (data):
Target queries:
Baseline, 28 days before: clicks, impressions, average position
Undo: the old text, or the commit to revert
Locked until: change date + 30 days
Checks due:
```

Then run this each week:

```
Weekly SEO run for this project, using OpenSEO.

1. Read the project context and follow the "Change rules" section.
2. Read the change logs from the last 45 days. List the locked pages and the changes due for a check.
3. Run the due checks with Search Console data. If a change is worse at 30 days, show me the revert and wait for my OK.
4. From the last 28 days of Search Console data, pick up to five unlocked pages worth improving. Show me the numbers behind each pick.
5. Make the changes I approve, then save this week's change log.
```

Approving reverts and changes yourself is deliberate: [What to automate and what to keep](/library/ai-agent-seo/what-to-automate) explains where to draw that line. If you only want the numbers, a [weekly SEO report](/blogs/weekly-seo-report) is a lighter place to start.

Keep batches small. A report summary holds 2,500 characters, and with fewer changes it's clearer which one worked.

## Want a hard lock and automatic reverts? Fork OpenSEO

The setup above relies on your agent following rules. If you want pages that can't be edited and changes that revert on their own, build them the way Moazzan did. OpenSEO is [open source](https://github.com/every-app/open-seo) under the MIT license.

Moazzan had tried building an SEO tool from scratch before, at the agency he worked for in late 2023. Two developers spent three months on it, and "it just ended miserably." With the fork, he only had to build what Importivity needed: "Anytime I felt that I needed something, I just built it." [Our other post on Importivity](/blogs/replace-seo-agency-with-ai) covers the rest of what he built.

I'd love to see more companies running forks like his. Self-hosting with your own DataForSEO account skips our 28% fee on data. You run hosting and updates yourself, and you need your own Google OAuth client for Search Console. [Self-hosting guide](/docs/self-hosting).

If you build something better on your fork, tell us.

## FAQ

### Does OpenSEO lock pages or revert changes?

No. OpenSEO doesn't natively edit your site yet (it's planned). Your own agent makes the changes, for example through the [WordPress MCP adapter](https://github.com/WordPress/mcp-adapter) or your site's repo, and the lock and revert are rules it reads from project context. To enforce them in code, fork OpenSEO.

### Does this weekly loop use credits?

Not the core loop. Search Console data, project context and reports don't use credits, while ranked keywords and keyword research do. The hosted plan is $10 a month with $10 of usage included. [See pricing](/pricing).
