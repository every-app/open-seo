#!/bin/sh
# Self-host container entrypoint.
#
# vite build inlines runtime-chosen client envs (AUTH_MODE, DATABASE_PROVIDER,
# VITE_*) into the client bundle, so the build has to run at container start
# rather than image-build time. But re-running it on *every* start — restarts,
# host reboots, Watchtower cycles — costs ~90s of downtime and a CPU spike for
# no benefit when nothing that affects the bundle changed.
#
# So: fingerprint the build-relevant env, and reuse dist/ when the fingerprint
# matches the last successful build. First start still builds; restarts with an
# unchanged env skip straight to serving. An image update lands a fresh
# container with no dist/, so it rebuilds as expected. Changing any inlined env
# (e.g. AUTH_MODE) changes the fingerprint and forces a rebuild.
set -e

echo 'OpenSEO sends an anonymous usage heartbeat (counts only). Disable: OPENSEO_TELEMETRY_DISABLED=1. Details: docs/SELF_HOSTING_DOCKER.md#telemetry'

# The preflight validates env BEFORE the slow steps, so misconfiguration fails
# in seconds with the exact fix instead of after a multi-minute build.
pnpm exec tsx scripts/selfhost-preflight.ts

pnpm run db:migrate:local

FP_FILE="dist/.openseo-build-env"
# Only the envs vite inlines into the client bundle affect build output.
BASE_ENV="AUTH_MODE=${AUTH_MODE:-}
DATABASE_PROVIDER=${DATABASE_PROVIDER:-}"
VITE_ENV="$(env | grep '^VITE_' | sort || true)"
FINGERPRINT="$(printf '%s\n%s\n' "$BASE_ENV" "$VITE_ENV" | sha256sum | cut -d' ' -f1)"

if [ -d dist ] && [ -f "$FP_FILE" ] && [ "$(cat "$FP_FILE")" = "$FINGERPRINT" ]; then
  echo "Reusing existing build (build-relevant env unchanged)."
else
  echo "Building client + server (first start, changed build env, or new image)..."
  pnpm run build
  printf '%s' "$FINGERPRINT" > "$FP_FILE"
fi

exec pnpm exec vite preview --host 0.0.0.0 --port "${PORT:-3001}"
