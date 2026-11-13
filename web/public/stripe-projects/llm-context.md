# OpenSEO on Stripe Projects

OpenSEO gives AI agents SEO data and tools over MCP: keyword research, SERP results, backlinks, domain and competitor research, rank tracking, site audits, Google Search Console, local SEO and AI visibility.

## Add OpenSEO

```bash
stripe projects add openseo/api
```

Once Stripe has verified the Stripe account's email, this creates an OpenSEO account for it, or links the existing OpenSEO account with that email. It writes two variables:

- `OPENSEO_API_KEY`: an OpenSEO API key (`oseo_...`)
- `OPENSEO_API_MCP_URL`: the MCP server, `https://app.openseo.so/mcp`

The prefix comes from the resource name, so run `stripe projects env` to see the exact names in this project.

## Connect an MCP client

The MCP server takes the key as a bearer token: `Authorization: Bearer $OPENSEO_API_KEY`.

Claude Code:

```bash
claude mcp add --transport http openseo https://app.openseo.so/mcp --header "Authorization: Bearer $OPENSEO_API_KEY"
```

Codex CLI:

```bash
codex mcp add openseo --url https://app.openseo.so/mcp --bearer-token-env-var OPENSEO_API_KEY
```

Other clients (`.mcp.json` style):

```json
{
  "mcpServers": {
    "openseo": {
      "type": "http",
      "url": "https://app.openseo.so/mcp",
      "headers": { "Authorization": "Bearer ${OPENSEO_API_KEY}" }
    }
  }
}
```

Start with the `list_projects` tool, or `create_project` with the user's website domain. Most tools take a `projectId`.

## Credits and billing

New accounts start with free credits. Research tools spend credits; when they run out, tools return an error with a billing link. Plans (from $10/month) and credit top-ups are bought in OpenSEO at https://app.openseo.so/billing, not through Stripe Projects. Leave purchases to the human. Prices: https://openseo.so/pricing

## Manage

- `stripe projects open openseo`: open a one-time sign-in page for the OpenSEO dashboard. The human confirms the account there.
- `stripe projects rotate openseo-api`: replace the key. The old key stops working immediately.
- `stripe projects remove openseo-api`: revoke the key. The OpenSEO account, its data and its credits stay.

Keys also appear in OpenSEO under Settings → API keys. Disconnecting Stripe Projects under Settings → Connected agents stops Stripe creating keys and revokes the ones it created; run `stripe projects add openseo/api` again to reconnect.

`--accept-tos` accepts OpenSEO's [Terms](https://openseo.so/terms-and-conditions) and [Privacy Policy](https://openseo.so/privacy). Full MCP docs: https://openseo.so/docs/mcp
