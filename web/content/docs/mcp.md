---
title: "Set up OpenSEO MCP"
description: "Connect OpenSEO MCP to Claude, Codex, and other AI clients."
---

OpenSEO MCP lets compatible AI clients call OpenSEO tools for keyword research, SERP inspection, local business research, competitive search intelligence, domain research, backlink overview, saved keywords, rank tracking, and Google Search Console performance and URL inspection.

The hosted MCP server URL is:

```txt
https://app.openseo.so/mcp
```

The first connection sends you through OpenSEO login. After authorization, your MCP client can call OpenSEO tools with the project context and account scopes you approved.

For the most current setup UI and a copyable endpoint, open [AI & MCP in OpenSEO](https://app.openseo.so/ai).

## Claude Code

Use user scope to make OpenSEO available across projects. Use local scope for the current repository.

```bash
claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp
```

After adding the server, approve the OpenSEO login when prompted.

## Claude Desktop

1. Open Settings -> Connectors.
2. Click Add custom connector.
3. Paste `https://app.openseo.so/mcp`.
4. Approve the OpenSEO login when prompted.

Claude Desktop custom connectors require a Claude plan that supports custom connectors.

## Cursor

1. Open Cursor Settings -> Tools & Integrations -> MCP Tools.
2. Click New MCP Server. Cursor opens `mcp.json`.
3. Add:

```json
{
  "mcpServers": {
    "openseo": {
      "url": "https://app.openseo.so/mcp"
    }
  }
}
```

4. Approve the OpenSEO login when prompted.

## Codex CLI

Run this in your terminal:

```bash
codex mcp add openseo --url https://app.openseo.so/mcp
```

Approve the login when prompted.

## Codex Desktop

1. Open Settings -> Integrations & MCP.
2. Click Add your own.
3. Paste `https://app.openseo.so/mcp`.
4. Approve the OpenSEO login when prompted.

## Available tools

OpenSEO MCP exposes tools for SEO research workflows:

- Research keywords with volume, difficulty, and CPC.
- Fetch live Google organic SERP results for keywords.
- Find exact keyword, page, rank, volume, CPC, intent, and traffic rows for a domain or page.
- Compare SERP competitors across a supplied keyword set.
- Search local businesses near a coordinate, fetch one Maps or Local Finder SERP, and read Google Business Q&A when needed.
- Hydrate keywords with search volume, difficulty, intent, CPC, and trends.
- List saved keywords from an OpenSEO project.
- Save useful keywords back to OpenSEO.
- Read rank tracker configs and latest keyword positions.
- Summarize a domain's organic footprint.
- Find keywords a domain already ranks for.
- Check backlink and referring-domain overview data.
- Read first-party Google Search Console performance (clicks, impressions, CTR, position).
- Inspect index status, crawl, and canonical for specific URLs (up to 10 per call).

## What to do after setup

Once OpenSEO MCP is connected, [set up OpenSEO Agent Skills](/docs/skills/setup). MCP gives your agent access to OpenSEO data. Skills are separate `SKILL.md` files that tell your agent how to use that data for specific SEO jobs.

Start with one focused workflow instead of asking your agent to "do SEO" broadly.

- Use [SEO project setup](/docs/skills/seo-project-setup) to capture your SEO goals and website context in a local workspace.
- Use [SEO coach](/docs/skills/seo-coach) if you are new to SEO or are not sure which workflow to run first.
- Use [keyword research](/docs/skills/keyword-research) to discover keyword opportunities.
- Use [competitive landscape](/docs/skills/competitive-landscape) to map a market before choosing competitors or pages.
- Use [competitor analysis](/docs/skills/competitor-analysis) to study one competitor.
- Use [keyword clustering](/docs/skills/keyword-clustering) to turn keywords into page groups.
- Use [link prospecting](/docs/skills/link-prospecting) to find outreach prospects for a linkable asset.

## Troubleshooting

If your client cannot connect, check that the server URL is exactly `https://app.openseo.so/mcp`.

If authorization fails, disconnect the OpenSEO server in your client, add it again, and repeat the login flow.

If your agent cannot find a project, ask it to list OpenSEO projects first and use the returned project ID in later tool calls.
