#!/bin/sh
# Container start for Docker self-hosting (Dockerfile.selfhost).
#
# `vite build` inlines the client-exposed env (vite.config.ts envPrefix) into
# the bundle, so dist is only valid for the exact values it was built with.
# Fingerprint those values plus the image build id and skip the ~90s rebuild
# when they match the previous start, instead of rebuilding on every start.
set -eu

cd "$(dirname "$0")/.."

# Lives inside dist so `vite build` wiping the outDir also invalidates the
# cache marker, and a freshly created (empty) dist volume never claims a hit.
FINGERPRINT_FILE="dist/.selfhost-build-fingerprint"

build_fingerprint() {
  {
    # Rebuild once when the image changes under a dist volume carried over
    # from an older container.
    cat .image-build-id 2>/dev/null || true
    echo "AUTH_MODE=${AUTH_MODE:-}"
    echo "BYPASS_EMAIL_VERIFICATION=${BYPASS_EMAIL_VERIFICATION:-}"
    echo "POSTHOG_HOST=${POSTHOG_HOST:-}"
    echo "POSTHOG_PUBLIC_KEY=${POSTHOG_PUBLIC_KEY:-}"
    echo "TURNSTILE_SITE_KEY=${TURNSTILE_SITE_KEY:-}"
    env | grep "^VITE_" | LC_ALL=C sort
  } | sha256sum | cut -d " " -f 1
}

if [ "${1:-}" = "--print-fingerprint" ]; then
  build_fingerprint
  exit 0
fi

echo "OpenSEO sends an anonymous usage heartbeat (counts only). Disable: OPENSEO_TELEMETRY_DISABLED=1. Details: docs/SELF_HOSTING_DOCKER.md#telemetry"

pnpm run db:migrate:local

current_fingerprint="$(build_fingerprint)"
if [ -f "$FINGERPRINT_FILE" ] && [ "$(cat "$FINGERPRINT_FILE")" = "$current_fingerprint" ]; then
  echo "Client bundle already built for this env; skipping vite build."
else
  pnpm run build:client
  printf '%s\n' "$current_fingerprint" >"$FINGERPRINT_FILE"
fi

exec pnpm exec vite preview --host 0.0.0.0 --port "${PORT:-3001}"
