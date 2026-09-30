#!/usr/bin/env bash
# One-time: stores a read-only Cloudflare API token so Claude can list the
# Access service tokens and application policies to debug the setup.
# Saved to ~/.config/openseo/cf-api-token, readable only by your user.
set -euo pipefail
dir="$HOME/.config/openseo"
mkdir -p "$dir" && chmod 700 "$dir"
read -r -s -p "Cloudflare API token (paste, then Enter): " tok; echo
tok="${tok//[$'\r\n\t ']/}"
if [ ${#tok} -lt 20 ]; then echo "Too short (${#tok}). Nothing saved."; exit 1; fi
printf '%s' "$tok" > "$dir/cf-api-token"
chmod 600 "$dir/cf-api-token"
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $tok" https://api.cloudflare.com/client/v4/user/tokens/verify)
unset tok
echo "Saved. Token verify HTTP $status (200 means it works)."
