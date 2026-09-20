#!/usr/bin/env bash
# Registers the self-hosted OpenSEO MCP in your own Claude Code (user scope)
# using the seo-automation service token. Prompts for the secret without
# echoing it. The secret is stored only in ~/.claude.json on this Mac.
set -euo pipefail
cd "$(dirname "$0")"
client_id=$(grep '^MCP_SERVICE_TOKEN_CLIENT_ID=' .env.selfhost | cut -d= -f2-)
subdomain=$(grep '^WORKERS_SUBDOMAIN=' .env.selfhost | cut -d= -f2-)
url="https://open-seo-selfhost.${subdomain}/mcp"
secret_file="$HOME/.config/openseo/cf-access-client-secret"
if [ -s "$secret_file" ]; then secret=$(cat "$secret_file"); else read -r -s -p "CF_ACCESS_CLIENT_SECRET: " secret; echo; fi
claude mcp remove --scope user openseo >/dev/null 2>&1 || true
claude mcp add --transport http --scope user openseo "$url" \
  --header "CF-Access-Client-Id: $client_id" \
  --header "CF-Access-Client-Secret: $secret"
unset secret
echo "Registered. Start 'claude' and run /mcp to confirm openseo shows as connected."
