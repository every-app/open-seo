---
title: "Install OpenSEO skills"
description: "Which ways of adding OpenSEO include the SEO skills, how to check what your agent has, and how to add the skills where they're missing."
---

**The OpenSEO plugins include the skills. Connectors and MCP connections don't.**

Skills are instruction files that walk your agent through a complete SEO workflow, such as an audit or keyword research, and save the result as a report in your project. Every way of adding OpenSEO gives your agent the tools. Without the skills, it can still research what you ask for in plain language, but it won't follow OpenSEO's workflows.

| How you added OpenSEO                                                                                                                     | Skills included |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| OpenSEO plugin for [Claude](/docs/claude-code-plugin), [ChatGPT](/docs/chatgpt#install-the-openseo-plugin) or [Codex](/docs/codex-plugin) | Yes             |
| [Claude connector](https://claude.ai/directory/connectors/openseo) from Claude's directory                                                | No              |
| Custom connector, custom connection, or MCP server added by hand                                                                          | No              |

The Claude connector is tools-only in every Claude app, including Claude Code and Cowork.

## Check what your agent has

| Agent        | How to check                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Claude       | Type `/` and look for OpenSEO skills such as `seo-coach` or `openseo:seo-coach`.                   |
| ChatGPT      | Select OpenSEO with `@`, then ask which OpenSEO skills it can use. The `@` menu doesn't list them. |
| Codex        | Type `$` and look for OpenSEO skills such as `seo-coach`.                                          |
| Other agents | Look in the agent's skill list or skills folder for `seo-coach`.                                   |

If your agent can list your OpenSEO projects but has no OpenSEO skills, it has the tools only. Add the skills below.

## Add the skills

### Claude

On a paid Claude plan, install the OpenSEO plugin. It includes the same tools as the connector.

- In the Claude app, claude.ai or Cowork: follow the [Customize → Plugins steps](/docs/claude-code-plugin#install-in-claude-cowork).
- In Claude Code: run the [two plugin commands](/docs/claude-code-plugin#install-in-claude-code).

On the Free plan, or with a self-hosted instance, upload the skills instead. The plugin needs a paid plan and connects only to hosted OpenSEO. Keep the connector, or use a [custom connector](/docs/claude-code-plugin#custom-connector) for a self-hosted instance, then:

1. Download the [OpenSEO repository](https://github.com/every-app/open-seo) as a ZIP (**Code → Download ZIP**) and unzip it.
2. Open `plugins/openseo/skills` and compress each skill folder you want into its own ZIP. Compress the folder itself, not the files inside it.
3. Upload each ZIP under **Customize → Skills**, then turn the skill on.

Skills in Claude chat and Cowork need **Code execution and file creation** turned on under **Settings → Capabilities**. On Team and Enterprise plans, an Owner controls this setting.

### ChatGPT

Install the [OpenSEO plugin for ChatGPT](/docs/chatgpt#install-the-openseo-plugin). A custom connection, including one to a self-hosted instance, has the tools only.

### Codex

Install the [OpenSEO plugin for Codex](/docs/codex-plugin), in the desktop app or the CLI.

### Cursor, Hermes, Grok Bot and other agents

Connect [OpenSEO MCP](/docs/mcp), then install the skills with the skills CLI:

```bash
npx skills add https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills
```

It asks which skills to install and for which agent. To skip the questions, add `--skill '*'` for every skill and `--agent` with your agent's name, such as `--agent cursor`.

For Hermes, install each skill through its skills hub instead, so Hermes can check for updates:

```bash
hermes skills install every-app/open-seo/plugins/openseo/skills/seo-coach
```

For Grok Bot, paste the [setup prompt](/docs/agent-setup#grok-bot) into your Bot.

To copy the files yourself, clone the [OpenSEO repository](https://github.com/every-app/open-seo) and copy the folders in `plugins/openseo/skills` into your agent's skills folder, such as `~/.claude/skills` or `~/.codex/skills`.

## Keep the skills up to date

OpenSEO updates the tools on its server. Skills are files in your agent, so they update through whatever installed them:

- ChatGPT plugin: nothing to do. The skills update when OpenSEO publishes a new version of the plugin.
- Claude plugin added under Customize: in **Customize → Plugins**, select **Check for updates**, or turn on **Sync automatically** for the OpenSEO marketplace.
- Everything else: use the [update prompt or commands](/docs/agent-setup#update-your-skills) on Agent setup.

## Next step

Start with [SEO Project Setup](/docs/skills/seo-project-setup) for a new SEO project, or [SEO Coach](/docs/skills/seo-coach) if you're not sure which workflow to run first.
