#!/usr/bin/env bash
# Verifies that the seo-automation service token can reach the OpenSEO MCP.
# Prompts for the Access client secret without echoing it and never stores it.
set -euo pipefail
cd "$(dirname "$0")"
client_id=$(grep '^MCP_SERVICE_TOKEN_CLIENT_ID=' .env.selfhost | cut -d= -f2-)
subdomain=$(grep '^WORKERS_SUBDOMAIN=' .env.selfhost | cut -d= -f2-)
url="https://open-seo-selfhost.${subdomain}/mcp"
secret_file="$HOME/.config/openseo/cf-access-client-secret"
if [ -s "$secret_file" ]; then secret=$(cat "$secret_file"); else read -r -s -p "CF_ACCESS_CLIENT_SECRET: " secret; echo; fi
body='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}'
health=$(curl -s -o /dev/null -w '%{http_code}' "https://open-seo-selfhost.${subdomain}/api/health" \
  -H "CF-Access-Client-Id: $client_id" -H "CF-Access-Client-Secret: $secret")
echo "/api/health with service token -> HTTP $health (200 means the token and policy are right)"
mcp_get=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$url" \
  -H "CF-Access-Client-Id: $client_id" -H "CF-Access-Client-Secret: $secret")
echo "GET /mcp with service token -> ${mcp_get:0:110}"
health_post=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -X POST "https://open-seo-selfhost.${subdomain}/api/health" \
  -H "CF-Access-Client-Id: $client_id" -H "CF-Access-Client-Secret: $secret")
echo "POST /api/health with service token -> ${health_post:0:110}"
response=$(curl -s -w '\nHTTP %{http_code} %{redirect_url}' -X POST "$url" \
  -H "CF-Access-Client-Id: $client_id" \
  -H "CF-Access-Client-Secret: $secret" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d "$body")
unset secret
echo "$response" | tail -1 | cut -c1-120
if echo "$response" | grep -q '"serverInfo"'; then
  echo "OK: the service token reaches the MCP and the server answered."
else
  echo "FAILED. Response (first 300 chars):"
  echo "$response" | head -c 300; echo
fi
