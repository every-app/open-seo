---
title: "Use OpenSEO with Codex"
description: "Add OpenSEO MCP and Agent Skills to Codex in the ChatGPT desktop app or the Codex CLI."
---

The OpenSEO plugin bundles OpenSEO MCP and all twelve SEO Agent Skills into one install. This is the preferred way to set up OpenSEO in Codex, in the ChatGPT desktop app or the CLI.

## Desktop app

In the ChatGPT desktop app, open **Codex** and start a new chat. Paste the [agent setup prompt](/docs/agent-setup#set-up-your-agent) so Codex can configure OpenSEO and guide you through sign-in.

If OpenSEO appears in your **Plugins** directory, install it, approve the OpenSEO sign-in, and start a new Codex chat. If the listing is missing, use the setup prompt or the CLI steps below.

Ask: “Use OpenSEO to check my connection and list my projects.” The check uses no OpenSEO credits. A tool call followed by your projects, or an empty list, confirms that this chat is connected.

Check [OpenAI's plan support](https://learn.chatgpt.com/docs/pricing) for access to your Codex client. Installing in Codex does not connect a regular chat on chatgpt.com. For that, use the [ChatGPT guide](/docs/chatgpt).

### MCP only in the desktop app

The plugin includes MCP and the SEO skills. For MCP alone:

1. Open **Codex**, then **Settings → MCP servers → Add server**.
2. Name it `openseo`, choose **Streamable HTTP**, and enter `https://app.openseo.so/mcp`.
3. Save and select **Restart** when prompted.
4. Select **Authenticate** for OpenSEO and approve sign-in when prompted. Skip this step for a local server configured without authentication.
5. Start a new Codex chat and ask: “Use OpenSEO to check my connection and list my projects.”

This local connection is separate from ChatGPT web. See [OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

## Install in the CLI

Run these commands in your terminal:

```bash
codex plugin marketplace add every-app/open-seo
codex plugin add openseo@openseo
codex mcp login openseo
```

`codex mcp login` opens a browser to approve the OpenSEO connection. If it reports that `openseo` isn't found, restart Codex first — bundled MCP servers only register after a restart, not immediately after install — then run `codex mcp login openseo` again.

Codex connects OpenSEO MCP at `https://app.openseo.so/mcp` and enables twelve skills:

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

### MCP only in the CLI

Use this if you want OpenSEO's tools without the skills. Run this in your terminal:

```bash
codex mcp add openseo --url https://app.openseo.so/mcp
```

Approve the login when prompted. To use an API key instead of signing in, see [Connect with an API key](/docs/mcp#connect-with-an-api-key).

## Run a skill

Type `$` in Codex to see available skills, or ask Codex to run one by name, for example "run seo-project-setup" or "run seo-audit on example.com".

## Update

```bash
codex plugin marketplace upgrade openseo
```

Reload or restart Codex if the updated skills are not available. If your CLI rejects a command, check `codex plugin --help` for the commands supported by your version. See [OpenAI's marketplace documentation](https://developers.openai.com/plugins/build/plugins). For plugins installed through a desktop directory, use that directory's controls.

For other installation methods, see [Agent setup and skill updates](/docs/agent-setup#update-your-skills).

## Remove

```bash
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

If Codex reports `Authorization server response missing required issuer: expected https://app.openseo.so`, upgrade Codex CLI or the Codex desktop app to 0.147.0 or later. Codex 0.143 through 0.146 drop the issuer from the OAuth callback. You can also [connect with an API key](/docs/mcp#connect-with-an-api-key) instead of OAuth.

## Other clients

For ChatGPT web, use the [ChatGPT setup guide](/docs/chatgpt). For Claude, see [Use OpenSEO with Claude](/docs/claude-code-plugin). For Cursor or an API key setup, see [Set up OpenSEO MCP](/docs/mcp) and [Set up OpenSEO Agent Skills](/docs/skills/setup).
