---
title: "Install the OpenSEO plugin for Codex"
description: "Add OpenSEO MCP and Agent Skills to Codex with one marketplace and one install command."
---

The OpenSEO plugin bundles OpenSEO MCP and all nine SEO Agent Skills into one install. This is the preferred way to set up OpenSEO in Codex CLI.

## Install

Run these commands in your terminal:

```bash
codex plugin marketplace add every-app/open-seo
codex plugin add openseo@openseo
codex mcp login openseo
```

`codex mcp login` opens a browser to approve the OpenSEO connection. If it reports that `openseo` isn't found, restart Codex first — bundled MCP servers only register after a restart, not immediately after install — then run `codex mcp login openseo` again.

Codex connects OpenSEO MCP at `https://app.openseo.so/mcp` and enables nine skills:

- SEO Project Setup
- SEO Coach
- SEO Audit
- Keyword Research
- Keyword Clustering
- Competitive Landscape
- Competitor Analysis
- Local SEO
- Link Prospecting

## Run a skill

Type `$` in Codex to see available skills, or ask Codex to run one by name, for example "run seo-project-setup" or "run seo-audit on example.com".

## Update or remove

```bash
codex plugin marketplace upgrade openseo
codex plugin remove openseo@openseo
```

## Troubleshooting

If the OpenSEO MCP server doesn't appear after restart, run `/mcp` in the Codex TUI to check its status, then run `codex mcp login openseo` again.

If it still doesn't authenticate, log out first and retry:

```bash
codex mcp logout openseo
codex mcp login openseo
```

If a `codex plugin` command reports "unrecognized subcommand," run `codex plugin --help` to see the subcommands your installed version actually supports — they've changed across versions (for example, `add`/`remove`, not `install`/`uninstall`).

## Other clients

This plugin is for Codex CLI. For Claude Code, use the [OpenSEO plugin for Claude Code](/docs/claude-code-plugin) instead. For Claude Desktop, Cursor, Codex Desktop, or an API key setup, see [Set up OpenSEO MCP](/docs/mcp) and [Set up OpenSEO Agent Skills](/docs/skills/setup).
