---
name: evaluate-skill
description: "Test a candidate SEOShark skill end to end by running fresh, isolated Codex sessions against the local backend and scoring the reports they save. Use when editing a product skill (seo-audit, keyword-research, ...) and you need evidence that the new instructions produce better output, not just a cleaner file."
metadata:
  internal: true
---

# Evaluate a skill

A skill edit is only as good as the reports it produces. This workflow runs the candidate skill in sessions that know nothing except the skill file, a one-line business brief, and a locked-down local MCP endpoint, then compares what came back.

## Prerequisites

- Local server in no-auth mode: `AUTH_MODE=local_noauth` in `.env.local`, then `pnpm db:migrate:local` and `pnpm dev` (or `pnpm dev:agents`). Pass the URL it prints, with `/mcp` appended, as `--endpoint`. Default local D1, never remote bindings or remote Postgres. Keep it private; it has no login.
- `codex` CLI on the path. Runs use its configured default model at high reasoning; record the resolved model from the events log if you need to name it.
- Research credits: the local server still calls DataForSEO. An audit run makes 20 to 40 tool calls. Do not run more sessions than the comparison needs.

## Run

```sh
node .agents/skills/evaluate-skill/scripts/run.mjs \
  --skill seo-audit \
  --site example.com --site holdout.example \
  --brief "Evaluation brief: Acme at example.com sells <what>. The goal is relevant organic visitors who could become customers. No first-party analytics are connected." \
  --brief "Evaluation brief: <the holdout business>. ..." \
  --endpoint http://<local-dev-host>/mcp
```

Runs take about 10 to 14 minutes and execute in parallel. Launch the script detached, because a tool-call timeout that kills the shell kills the sessions too:

```sh
(nohup node .agents/skills/evaluate-skill/scripts/run.mjs ... > .logs/eval.log 2>&1 &)
```

What the script does, per site:

1. Copies the candidate skill and `seo-report` into a fresh temp folder. Edits during the run cannot change its instructions; the manifest records the skill hashes.
2. Creates a new local project seeded only with the brief.
3. Starts a gateway in front of the local MCP that allows a fixed tool list and rejects any call for another project id, then probes that rejection before starting.
4. Runs `codex exec` ephemeral, ignoring user config, memories, apps, plugins, and multi-agent, with the skill's self-review as the only reviewer.
5. Captures the saved report HTML, every MCP call and response, the event stream, and the final message under the output folder.

Read the reports with `node .agents/skills/evaluate-skill/scripts/report-text.mjs <out>/*-report.html`. Each session's working notes (for seo-audit, `opportunities.md` and `evidence/`) stay in its temp folder, named in `manifest.json`.

## Isolation rules

- **Instructions:** frozen copies only. Never point a session at the working tree.
- **Conversation:** a new `codex exec` per run. Never resume or fork.
- **Data:** a new project per run, seeded with the user-provided brief and nothing else. Never write evaluator notes, prior reports, or a reference answer into any project the sessions can read.
- **Prompt:** the same neutral prompt for every variant. Do not name expected findings, target keywords, or the rubric.
- **Evaluator material** (rubric, reference audits, prior reports) lives outside the session folders and outside the repository. Raw artifacts belong in the ignored `.logs/`.

This is practical isolation, not a security boundary: sessions share the local account, provider caches, and organization limits.

## Compare

Always run at least two sessions of the site you are tuning on and one holdout site with a different shape, so an instruction that fits one company's answer is caught. Keep every run, including failures; do not pick the best of several and call the skill fixed.

Score each report before opening its tool trace, then read the trace to classify any miss as discovery, tool, reasoning, or reporting. For an audit report:

| Dimension                       | Weight | A strong report...                                                                                                 |
| ------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------ |
| Discovery and coverage          |    25% | Reads commercial pages and their siblings, tools, and technical paths; broadens when a signal appears              |
| Diagnosis and evidence          |    20% | Checks live pages and live results; separates observations from causes; records source, date, and settings        |
| Business value and scale        |    20% | Ties each action to a real buyer; compares competing opportunities; never invents conversion or revenue            |
| Prioritization                  |    15% | Leads with a bounded change to a demonstrated problem for likely buyers; keeps maintenance and broad programs back |
| Calibration                     |    10% | Makes useful calls without analytics; no penalty, causation, or trend claims the evidence cannot carry             |
| Communication and actionability |    10% | Names the page, the change, and the reason; material findings survive compression                                  |

A material factual error overrides the score. Ask a second model to recompute every live position from the run's own MCP log before trusting a report's numbers.

Coverage checks that generalize beyond any one site:

- Sibling pages in an important family (comparison, pricing, template, location) were read side by side, and a page that only swaps a name into a shared answer was noticed.
- A page already at the top for its query was protected, not rewritten.
- Every serious candidate ended as a recommendation or as a table row with a real reason. A vague "later" is a miss.
- Search volume, visits, and revenue were kept distinct; US demand was not multiplied into a global figure.

## What past evaluations taught

- **Instruction length hurts.** A 3,600-word skill of cautions performed worse than a 2,200-word skill with a fixed process. Add a step, not a warning.
- **Force the comparison.** Sessions that wrote a shortlist before drafting kept their diagnoses; sessions that drafted straight from research ranked by raw query volume.
- **Show the rejected candidates.** A "What else we checked" table in the report is what stops material findings from disappearing when the report is shortened.
- **One snapshot lies.** Positions around 8 to 12 change between two checks minutes apart; the skill re-runs decisive queries and reports both.
- **Labels beat notes.** Readers rejected "10th of 17 organic rows" and arrows; tables now say "#10 (page 1)" with market and date in the header.

## Clean up

Each run's project, report, and audit can be removed through MCP with `delete_report`, `delete_site_audit`, and `update_project_context`, or left in the local database. A new project per run is simpler than proving an old one is clean. Stop the local server when finished.
