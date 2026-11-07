# OpenSEO for Grok Bot, Cursor and Hermes

SEO made simple.

OpenSEO gives your agent real SEO data and guided workflows, so its advice is grounded in your website instead of generic recommendations.

## What you can do

- Find and evaluate keywords
- Research competitors and content gaps
- Audit a website and prioritize fixes
- Analyze backlinks and find link prospects
- Track organic and Google Maps rankings
- Work with Google Search Console and Analytics data
- Research AI prompts and track brand mentions, citations, and competitors

The plugin includes twelve skills that guide your agent through complete SEO workflows, plus the hosted OpenSEO MCP server for live data and project management.

## Connect

Install OpenSEO from the Grok Bot or Cursor marketplace, or in Hermes run `hermes plugins install openseo`. The first time your agent uses an OpenSEO tool, follow the OAuth prompt to sign in and approve the connection. There is no API key to configure.

To check the connection without using credits, ask: "Use OpenSEO to check my connection and list my projects."

You need an OpenSEO account. The plugin package is free and open source. Hosted OpenSEO plans and usage credits are described at [openseo.so/pricing](https://openseo.so/pricing), and OpenSEO can also be [self-hosted](https://github.com/every-app/open-seo#self-hosting).

## Hermes

Hermes connects through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) 0.1.49, which `npx` downloads from npm, so Node.js and npm must be installed. The first OpenSEO tool call opens your browser to sign in, and `mcp-remote` keeps the sign-in in `~/.mcp-auth`.

On a server or any machine without a browser, create a key under **Settings → API keys** in [OpenSEO](https://app.openseo.so/settings), set `OPENSEO_API_KEY` in your Hermes `.env`, and add this to `config.yaml`. It replaces the plugin's connection and keeps its skills:

```yaml
mcp_servers:
  openseo:
    url: https://app.openseo.so/mcp
    headers:
      Authorization: "Bearer ${OPENSEO_API_KEY}"
```

Every tool call goes to `app.openseo.so` and acts on your OpenSEO account. Research tools spend OpenSEO credits, and some tools create or change projects, saved keywords, rank trackers and reports. The package has no code of its own, no telemetry and no self-updater.

## Try it

- "Research keywords for my website and shortlist the best opportunities."
- "Audit my website and tell me what to fix first."
- "What does competitor.com rank for that I don't?"
- "Which pages are close to ranking in Google Search Console?"
- "Track my rankings for these keywords and summarize what changed."
- "Help me choose prompts to track in AI answers, and show the cost first."

## Included skills

- AI prompt research
- AI visibility audit
- Competitive landscape
- Competitor analysis
- Keyword clustering
- Keyword research
- Link prospecting
- Local SEO
- SEO audit
- SEO coach
- SEO project setup
- SEO report

## Links

- [OpenSEO](https://openseo.so)
- [MCP documentation](https://openseo.so/docs/mcp)
- [Privacy policy](https://openseo.so/privacy)
- [Terms](https://openseo.so/terms-and-conditions)
- [Support](https://openseo.so/support)
