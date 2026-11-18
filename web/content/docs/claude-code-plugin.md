---
title: "Use OpenSEO with Claude"
description: "Add the OpenSEO connector to Claude, or install the plugin to get OpenSEO MCP and Agent Skills in Claude Code and Claude Cowork."
---

**Quickest way:** add the [OpenSEO connector](https://claude.ai/directory/connectors/openseo) from Claude's directory. It gives Claude OpenSEO's tools on the web, desktop and mobile, and in Cowork and Claude Code when you're signed in to the same Claude account. Sign in with your OpenSEO account when Claude asks. If the link doesn't open the listing, open **Customize → Connectors** in Claude, search for OpenSEO, and select **Connect to Claude**.

The connector doesn't include the SEO skills. To get them, install the OpenSEO plugin below instead. It includes the same tools, so you don't need both. Added under **Customize → Plugins**, it works in Claude chat, Cowork and Claude Code. On the Free plan, keep the connector and [upload the skills](/docs/skills/setup#claude) instead.

## Choose your setup path

| Where you want to work                        | How to connect                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Claude on the web, desktop or mobile          | Add the [OpenSEO connector](https://claude.ai/directory/connectors/openseo) |
| Claude Code                                   | [Install the plugin](#install-in-claude-code)                               |
| Claude Cowork                                 | [Install the plugin](#install-in-claude-cowork)                             |
| Self-hosted, or the connector isn't available | [Add a custom connector](#custom-connector)                                 |

The OpenSEO plugin bundles OpenSEO MCP and all twelve SEO Agent Skills into one install. This is the preferred way to set up OpenSEO in Claude Code and in Claude Cowork.

## Install in Claude Code

Run these two commands in Claude Code:

```bash
/plugin marketplace add every-app/open-seo
/plugin install openseo@openseo
```

If the install summary says `Run /reload-plugins to activate.`, run that command.

Claude Code connects OpenSEO MCP at `https://app.openseo.so/mcp` and enables twelve skills:

- SEO Project Setup
- SEO Coach
- SEO Audit
- AI Visibility Audit
- AI Prompt Research
- Keyword Research
- Keyword Clustering
- Competitive Landscape
- Competitor Analysis
- Local SEO
- Link Prospecting
- SEO Report

### MCP only in Claude Code

Use this if you want OpenSEO's tools without the skills. Use user scope to make OpenSEO available across projects. Use local scope for the current repository.

```bash
claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp
```

After adding the server, approve the OpenSEO login when prompted. To use an API key instead of signing in, see [Connect with an API key](/docs/mcp#connect-with-an-api-key).

## Finish the login

Claude Code should prompt you to log in to OpenSEO right after install. If it doesn't, run `/mcp` and approve the OpenSEO connection from there.

## Run a skill

In Claude Code, plugin skills are namespaced by the plugin name:

```
/openseo:seo-project-setup
/openseo:seo-coach
/openseo:seo-audit
/openseo:ai-visibility-audit
/openseo:ai-prompt-research
/openseo:keyword-research
/openseo:keyword-clustering
/openseo:competitive-landscape
/openseo:competitor-analysis
/openseo:local-seo
/openseo:link-prospecting
/openseo:seo-report
```

## Install in Claude Cowork

Claude Cowork and the Claude desktop app install plugins through the Customize menu, not slash commands. An agent can't click these steps for you.

1. Open **Customize** in the left sidebar. In Cowork, open the **Cowork** tab first.
2. Open **Plugins**, click **+** or **Add**, and choose **Add marketplace**.
3. Choose **Add from a repository** and enter `https://github.com/every-app/open-seo`.
4. Find **OpenSEO** in the new marketplace and click **Install** or **Add**.
5. Sign in to OpenSEO and approve the connection when Claude asks.
6. Start a new task, type `/`, and check that the OpenSEO skills appear. Then try "Use OpenSEO to check my connection and list my projects." This check uses no OpenSEO credits.

If Claude can list your projects but no OpenSEO skills appear under `/`, you have a connector, not the plugin. Install the plugin, then remove the OpenSEO connector under **Customize → Connectors** so you keep one connection.

Plugins need a paid Claude plan (Pro, Max, Team, or Enterprise). Your organization can limit which marketplaces you can add. On the Free plan, add the [OpenSEO connector](https://claude.ai/directory/connectors/openseo) and [upload the skills](/docs/skills/setup#claude) under **Customize → Skills**. With a self-hosted instance, [add a custom connector](#custom-connector) instead. The plugin connects only to hosted OpenSEO. See [Anthropic's plugin guide](https://support.claude.com/en/articles/13837440-use-plugins-in-claude).

## Custom connector

Use a custom connector to connect a self-hosted instance, or if the OpenSEO connector isn't available to you. It gives Claude OpenSEO's tools but not the SEO skills. Claude labels custom connectors **Custom** and doesn't suggest them in chats, so use the OpenSEO connector unless you self-host.

1. Open Customize -> Connectors.
2. Click Add (or +), then choose Add custom connector.
3. Paste `https://app.openseo.so/mcp`. For a self-hosted instance, use your instance's address followed by `/mcp`.
4. Approve the OpenSEO login when prompted.

Claude Desktop custom connectors are available on Free, Pro, Max, Team, and Enterprise plans. Free plans support one custom connector. To add the skills without the plugin, [upload them](/docs/skills/setup#claude) under **Customize → Skills**.

## Update

Run inside Claude Code:

```text
/plugin marketplace update openseo
/plugin update openseo@openseo
/reload-plugins
```

Updates land in the cache immediately, but the running session keeps the old version until you run `/reload-plugins` or restart Claude Code.

You can enable automatic updates in `/plugin` → **Marketplaces** → **openseo** → **Enable auto-update**. Third-party marketplaces have this off by default. Reload when Claude prompts you to activate an update. See [Claude's plugin update documentation](https://code.claude.com/docs/en/discover-plugins#configure-auto-updates).

For other installation methods, see [Agent setup and skill updates](/docs/agent-setup#update-your-skills).

## Remove

```text
/plugin uninstall openseo@openseo
```

## Troubleshooting

To check what's actually installed, run `/plugin list` rather than bare `/plugin` — `/plugin` alone opens an interactive panel that doesn't show plain text.

If `/reload-plugins` reports `0 skills`, that's normal, not a failure — its summary only counts a plugin's `commands/` directory, not `skills/`. Confirm the skills loaded by running one directly, for example `/openseo:seo-audit`.

If `/plugin uninstall openseo@openseo` reports "not installed in this project," you likely installed to a different scope than the one being checked (User, Project, or Local). Run `/plugin list` to see the actual scope, or sidestep the picker entirely with the shell form: `claude plugin uninstall openseo@openseo --scope user`.

If plugin skills don't appear, clear the plugin cache with `rm -rf ~/.claude/plugins/cache` — this clears every installed plugin's cache, not just OpenSEO's, so reinstall anything else you have after — then restart Claude Code and reinstall the plugin.

If the OpenSEO connection doesn't show as authenticated, run `/mcp`, select OpenSEO, and complete the login.

## Other clients

This page covers Claude. For Codex in the CLI or the ChatGPT desktop app, see [Use OpenSEO with Codex](/docs/codex-plugin). For ChatGPT, see the [ChatGPT guide](/docs/chatgpt). For Cursor or an API key setup, see [Set up OpenSEO MCP](/docs/mcp) and [Set up OpenSEO Agent Skills](/docs/skills/setup).
