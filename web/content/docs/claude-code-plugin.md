---
title: "Install the OpenSEO plugin for Claude Code"
description: "Add OpenSEO MCP and Agent Skills to Claude Code with one marketplace and one install command."
---

The OpenSEO plugin bundles OpenSEO MCP and all nine SEO Agent Skills into one install. This is the preferred way to set up OpenSEO in Claude Code.

## Install

Run these two commands in Claude Code:

```bash
/plugin marketplace add every-app/open-seo
/plugin install openseo@openseo
```

If the install summary says `Run /reload-plugins to activate.`, run that command.

Claude Code connects OpenSEO MCP at `https://app.openseo.so/mcp` and enables nine skills:

- SEO Project Setup
- SEO Coach
- SEO Audit
- Keyword Research
- Keyword Clustering
- Competitive Landscape
- Competitor Analysis
- Local SEO
- Link Prospecting

## Finish the login

Claude Code should prompt you to log in to OpenSEO right after install. If it doesn't, run `/mcp` and approve the OpenSEO connection from there.

## Run a skill

Plugin skills are namespaced by the plugin name:

```
/openseo:seo-project-setup
/openseo:seo-coach
/openseo:seo-audit
/openseo:keyword-research
/openseo:keyword-clustering
/openseo:competitive-landscape
/openseo:competitor-analysis
/openseo:local-seo
/openseo:link-prospecting
```

## Claude Desktop

Claude Desktop doesn't support this plugin format — plugins are a Claude Code feature. For Claude Desktop, [add OpenSEO as an MCP connector](/docs/mcp#claude-desktop) instead.

## Update or remove

```bash
/plugin marketplace update openseo
/plugin uninstall openseo@openseo
```

Updates land in the cache immediately, but the running session keeps the old version until you run `/reload-plugins` or restart Claude Code.

## Troubleshooting

To check what's actually installed, run `/plugin list` rather than bare `/plugin` — `/plugin` alone opens an interactive panel that doesn't show plain text.

If `/reload-plugins` reports `0 skills`, that's normal, not a failure — its summary only counts a plugin's `commands/` directory, not `skills/`. Confirm the skills loaded by running one directly, for example `/openseo:seo-audit`.

If `/plugin uninstall openseo@openseo` reports "not installed in this project," you likely installed to a different scope than the one being checked (User, Project, or Local). Run `/plugin list` to see the actual scope, or sidestep the picker entirely with the shell form: `claude plugin uninstall openseo@openseo --scope user`.

If plugin skills don't appear, clear the plugin cache with `rm -rf ~/.claude/plugins/cache` — this clears every installed plugin's cache, not just OpenSEO's, so reinstall anything else you have after — then restart Claude Code and reinstall the plugin.

If the OpenSEO connection doesn't show as authenticated, run `/mcp`, select OpenSEO, and complete the login.

## Other clients

This plugin is for Claude Code. For Codex CLI, use the [OpenSEO plugin for Codex](/docs/codex-plugin) instead. For Cursor, Codex Desktop, Claude Desktop, or an API key setup, see [Set up OpenSEO MCP](/docs/mcp) and [Set up OpenSEO Agent Skills](/docs/skills/setup).
