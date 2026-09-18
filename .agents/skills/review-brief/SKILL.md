---
name: review-brief
description: Produce a scannable review brief for a branch or PR so the maintainer can approve without reading the whole diff. Use when the user asks "how do I review this", "summarize the changes", "what should I look at", or wants to understand a PR in under two minutes.
metadata:
  internal: true
---

# Review brief

The reader will not read the diff. They will skim for 30 seconds, then read only
the code that could hurt them. Optimize for that.

## Process

1. Get the diff (`git log --oneline main..HEAD`, `git diff --stat main..HEAD`) and
   read every non-trivial changed file in full.
2. Find the invariant core: what was broken, what is true now. One sentence.
3. Classify every hunk. Anything matching the crucial criteria below goes into
   the code section verbatim. Everything else gets one table row or is folded.
4. Write the brief in the layout below. Every line number cited must be verified
   against the working tree.
5. Run a second agent as a reviewer of the CODE, not the prose: "what is wrong,
   overstated, or missing?" Fix real bugs before delivering, and say you did.

## Crucial code criteria

A hunk is crucial and must be shown as code if it touches any of:

- **Schema.** Drizzle tables, columns, indexes, migrations, Zod schemas at a
  trust boundary, MCP tool input or output schemas.
- **Database writes.** New or changed INSERT/UPDATE/DELETE, conditional WHERE
  clauses, anything that runs inside a workflow step or a cron.
- **Security.** Auth checks, scope or org or project gating, secrets, external
  calls with credentials, anything that fails open.
- **Core logic.** The branch or expression that decides the outcome the bug was
  about: a status assignment, a validation gate, a ranking comparator, a retry
  or timeout policy.
- **Jank.** Anything you would be embarrassed to defend in review. String-matching
  a vendor error message to pick UI copy. A regex standing in for a parser. A
  hard-coded lookup table. A `console.warn` where a metric belongs. A swallowed
  catch. A magic timeout. A DB read added to work around a missing parameter.
  A fallback that quietly changes behaviour. Show it, name it as jank in the
  sentence above, and say whether it is acceptable for now or should block.

Show each as 5 to 20 lines, trimmed to the decision, with one sentence above
saying what to notice and one line below naming the failure mode if it is wrong.
Three to six excerpts is normal. If there are more than six, the PR should
probably be split; say so.

## Layout

**One sentence** stating what was broken and what is true now.

**Before / after diagram.** One ASCII flow, two columns, showing the user-visible
path. Boxes are steps, arrows are what flows. Label the bug locations.

**The code that matters.** The crucial excerpts, in reading order by risk.
This section is the point of the brief. Do not defer it to a follow-up.

**Everything else, in one table.** Sorted by risk:

| # | File | What it does | The one thing to check |

One row per remaining meaningful change. Fold registrations, renames,
formatting, and fixtures into a single final row.

**What does NOT exist.** Bullets naming the things a reader would assume were
added and were not: no migration, no new dependency, no change to a persisted
shape, no new auth path.

**Decisions you might disagree with.** Two to four bullets. Each: the choice,
the alternative, the cost of the choice. No defence longer than one sentence.

**Status table.** Whatever numbers gate the merge: tests, dry-run counts,
"applied to prod: No".

**Try it in two minutes.** The two or three commands that exercise the change.

**Branch state.** Commits, pushed or not, PR link or "no PR yet".

## Rules

- No paragraph over two sentences anywhere.
- Bold the first few words of every bullet so the list skims by its openers.
- Tables for anything with three or more parallel facts.
- Code goes in fences, never in prose. Name a file only when the reader has to go there.
- Cut history, rejected alternatives, and migration narrative unless asked.
- Never simplify into inaccuracy. A detail that changes what the reader would do
  stays, as one line.
- Under 600 words of prose. Code excerpts and tables do not count.

## Anti-patterns

- A numbered walkthrough with paragraphs per stop and a "Check:" paragraph.
- Describing a WHERE clause, an auth check, or a status expression in words
  instead of showing it.
- Hiding jank in a "decisions you might disagree with" bullet. If it is in the
  code, show the code.
- Saving the code for "want me to show you the code?" The reader asked for a
  review brief; the code is the brief.
- A draft PR description inline. Put it in a file and link it.
