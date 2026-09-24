---
title: "Install the SEOShark plugin for Claude Code"
description: "Add SEOShark MCP and Agent Skills to Claude Code with one marketplace and one install command."
---

The SEOShark plugin bundles SEOShark MCP and all ten SEO Agent Skills into one install. This is the preferred way to set up SEOShark in Claude Code.

## Install

Run these two commands in Claude Code:

```bash
/plugin marketplace add bizztor/seoshark
/plugin install seoshark@seoshark
```

If the install summary says `Run /reload-plugins to activate.`, run that command.

Claude Code connects SEOShark MCP at `https://app.seoshark.example/mcp` and enables ten skills:

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

## Finish the login

Claude Code should prompt you to log in to SEOShark right after install. If it doesn't, run `/mcp` and approve the SEOShark connection from there.

## Run a skill

Plugin skills are namespaced by the plugin name:

```
/seoshark:seo-project-setup
/seoshark:seo-coach
/seoshark:seo-audit
/seoshark:keyword-research
/seoshark:keyword-clustering
/seoshark:competitive-landscape
/seoshark:competitor-analysis
/seoshark:local-seo
/seoshark:link-prospecting
```

## Claude Desktop

Claude Desktop doesn't support this plugin format — plugins are a Claude Code feature. For Claude Desktop, [add SEOShark as an MCP connector](/docs/mcp#claude-desktop) instead.

## Update

Run inside Claude Code:

```text
/plugin marketplace update seoshark
/plugin update seoshark@seoshark
/reload-plugins
```

Updates land in the cache immediately, but the running session keeps the old version until you run `/reload-plugins` or restart Claude Code.

For other installation methods, see [Agent setup and skill updates](/docs/agent-setup#update-your-skills).

## Remove

```text
/plugin uninstall seoshark@seoshark
```

## Troubleshooting

To check what's actually installed, run `/plugin list` rather than bare `/plugin` — `/plugin` alone opens an interactive panel that doesn't show plain text.

If `/reload-plugins` reports `0 skills`, that's normal, not a failure — its summary only counts a plugin's `commands/` directory, not `skills/`. Confirm the skills loaded by running one directly, for example `/seoshark:seo-audit`.

If `/plugin uninstall seoshark@seoshark` reports "not installed in this project," you likely installed to a different scope than the one being checked (User, Project, or Local). Run `/plugin list` to see the actual scope, or sidestep the picker entirely with the shell form: `claude plugin uninstall seoshark@seoshark --scope user`.

If plugin skills don't appear, clear the plugin cache with `rm -rf ~/.claude/plugins/cache` — this clears every installed plugin's cache, not just SEOShark's, so reinstall anything else you have after — then restart Claude Code and reinstall the plugin.

If the SEOShark connection doesn't show as authenticated, run `/mcp`, select SEOShark, and complete the login.

## Other clients

This plugin is for Claude Code. For Codex CLI, use the [SEOShark plugin for Codex](/docs/codex-plugin) instead. For Cursor, Codex Desktop, Claude Desktop, or an API key setup, see [Set up SEOShark MCP](/docs/mcp) and [Set up SEOShark Agent Skills](/docs/skills/setup).
