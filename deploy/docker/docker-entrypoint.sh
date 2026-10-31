#!/bin/sh
# Self-host container entrypoint. vite build inlines the envPrefix'd client
# envs (see vite.config.ts) into the bundle, so the build must run at container
# start — but the output stays valid until those envs or the image change.
# Fingerprint them and skip the build when the last start's output matches; an
# image update lands a fresh container with no build output, so new code always
# rebuilds.
set -e

echo 'OpenSEO sends an anonymous usage heartbeat (counts only). Disable: OPENSEO_TELEMETRY_DISABLED=1. Details: docs/SELF_HOSTING_DOCKER_LEGACY.md#telemetry'

# The preflight validates env BEFORE the slow steps, so misconfiguration fails
# in seconds with the exact fix instead of after a multi-minute build.
pnpm exec tsx scripts/selfhost-preflight.ts

pnpm run db:migrate:local

FP_FILE="dist/.openseo-build-env"

# Everything that changes build output: the envPrefix prefixes from
# vite.config.ts (keep in sync) plus POSTHOG_SOURCEMAPS.
FINGERPRINT="$(env | grep -E '^(VITE_|AUTH_MODE|BYPASS_EMAIL_VERIFICATION|POSTHOG_PUBLIC_KEY|POSTHOG_HOST|TURNSTILE_SITE_KEY|POSTHOG_SOURCEMAPS)' | sort | sha256sum | cut -d' ' -f1)"
# A missing sha256sum would yield an empty, always-matching fingerprint and
# silently disable rebuilds — fail loudly instead.
test -n "$FINGERPRINT"

if [ -f "$FP_FILE" ] && [ "$(cat "$FP_FILE")" = "$FINGERPRINT" ]; then
  echo "Reusing existing build (build-relevant env unchanged)."
else
  echo "Building client + server (first start, changed build env, or new image)..."
  rm -f "$FP_FILE"
  pnpm run build
  printf '%s' "$FINGERPRINT" > "$FP_FILE"
fi

# The local preview runtime exposes scheduled handlers but does not emit cron
# events by itself. The supervisor runs preview and the loopback scheduler together.
exec node scripts/selfhost-scheduler.mjs
