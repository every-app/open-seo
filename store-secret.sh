#!/usr/bin/env bash
# One-time: stores the seo-automation Access client secret in a file only your
# user can read (~/.config/openseo/cf-access-client-secret). The verify and
# connect scripts read it from there so nobody has to retype it.
set -euo pipefail
dir="$HOME/.config/openseo"
mkdir -p "$dir" && chmod 700 "$dir"
read -r -s -p "CF_ACCESS_CLIENT_SECRET (paste, then Enter): " secret; echo
secret="${secret//[$'\r\n\t ']/}"
if [ ${#secret} -lt 20 ]; then echo "That looks too short (${#secret} characters). Nothing saved."; exit 1; fi
echo "Received ${#secret} characters."
printf '%s' "$secret" > "$dir/cf-access-client-secret"
chmod 600 "$dir/cf-access-client-secret"
unset secret
echo "Saved ${#secret:-0} characters to $dir/cf-access-client-secret"
