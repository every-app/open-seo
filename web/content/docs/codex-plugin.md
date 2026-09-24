---
title: "Install the SEOShark plugin for Codex"
description: "Add SEOShark MCP and Agent Skills to Codex with one marketplace and one install command."
---

The SEOShark plugin bundles SEOShark MCP and all ten SEO Agent Skills into one install. This is the preferred way to set up SEOShark in Codex CLI.

## Install

Run these commands in your terminal:

```bash
codex plugin marketplace add bizztor/seoshark
codex plugin add seoshark@seoshark
codex mcp login seoshark
```

`codex mcp login` opens a browser to approve the SEOShark connection. If it reports that `seoshark` isn't found, restart Codex first — bundled MCP servers only register after a restart, not immediately after install — then run `codex mcp login seoshark` again.

Codex connects SEOShark MCP at `https://app.seoshark.example/mcp` and enables ten skills:

- SEO Project Setup
- SEO Coach
- SEO Audit
- Keyword Research
- Keyword Clustering
- Competitive Landscape
- Competitor Analysis
- Local SEO
- Link Prospecting
- SEO Report

## Run a skill

Type `$` in Codex to see available skills, or ask Codex to run one by name, for example "run seo-project-setup" or "run seo-audit on example.com".

## Update

```bash
codex plugin marketplace upgrade seoshark
```

Reload or restart Codex if the updated skills are not available. For other installation methods, see [Agent setup and skill updates](/docs/agent-setup#update-your-skills).

## Remove

```bash
codex plugin remove seoshark@seoshark
```

## Troubleshooting

If the SEOShark MCP server doesn't appear after restart, run `/mcp` in the Codex TUI to check its status, then run `codex mcp login seoshark` again.

If it still doesn't authenticate, log out first and retry:

```bash
codex mcp logout seoshark
codex mcp login seoshark
```

If a `codex plugin` command reports "unrecognized subcommand," run `codex plugin --help` to see the subcommands your installed version actually supports — they've changed across versions (for example, `add`/`remove`, not `install`/`uninstall`).

## Other clients

This plugin is for Codex CLI. For Claude Code, use the [SEOShark plugin for Claude Code](/docs/claude-code-plugin) instead. For Claude Desktop, Cursor, Codex Desktop, or an API key setup, see [Set up SEOShark MCP](/docs/mcp) and [Set up SEOShark Agent Skills](/docs/skills/setup).
