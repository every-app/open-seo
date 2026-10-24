#!/bin/sh
# Self-host container entrypoint. vite build inlines the envPrefix'd client
# envs (see vite.config.ts) into the bundle, so the build must run at container
# start — but the output stays valid until those envs or the image change.
# Fingerprint them and skip the build when the last start's output matches; an
# image update lands a fresh container with no build output, so new code always
# rebuilds.
set -e

# Fork: Railway sets RAILWAY_GIT_COMMIT_MESSAGE to the deployed commit's whole
# message. With CLOUDFLARE_INCLUDE_PROCESS_ENV the build below writes every
# process env var to dist/.dev.vars and aborts on a value it cannot quote: one
# holding an apostrophe, a backtick and a newline, which an ordinary multi-line
# commit message does. A failed build here is a container that never starts,
# so drop the variable. Nothing reads it.
unset RAILWAY_GIT_COMMIT_MESSAGE
# Fork: this deployment's keys live in Doppler (owner decision, 2026-10-23, after
# the Railway breach). Railway keeps only DOPPLER_TOKEN, a read-only service token,
# and DOPPLER_ONLY, the names this service needs. Load them before the preflight
# checks them. Without DOPPLER_TOKEN nothing changes; with it and Doppler
# unreadable, the container stops rather than start without its keys. The token
# itself is dropped after: the build below writes process env to dist/.dev.vars.
exports="$(node scripts/doppler-env.mjs --export)" || exit 1
eval "$exports"
unset exports DOPPLER_TOKEN DOPPLER_ONLY

echo 'OpenSEO sends an anonymous usage heartbeat (counts only). Disable: OPENSEO_TELEMETRY_DISABLED=1. Details: docs/SELF_HOSTING_DOCKER.md#telemetry'

# The preflight validates env BEFORE the slow steps, so misconfiguration fails
# in seconds with the exact fix instead of after a multi-minute build.
pnpm exec tsx scripts/selfhost-preflight.ts

pnpm run db:migrate:local

# POSTHOG_SOURCEMAPS (CI sourcemap uploads) moves vite's outDir; keep the
# fingerprint marker beside the output it describes.
if [ "${POSTHOG_SOURCEMAPS:-}" = "true" ]; then OUT_DIR=dist-sourcemaps; else OUT_DIR=dist; fi
FP_FILE="$OUT_DIR/.openseo-build-env"

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
#
# Fork: the scheduler is opt-in (OPENSEO_SELFHOST_SCHEDULER=1). This deployment
# runs its rank trackers from an external weekly job, and trackers saved with a
# "weekly" interval before self-host could schedule anything are long overdue,
# so cron would run them at once and then again every week beside that job.
if [ "${OPENSEO_SELFHOST_SCHEDULER:-}" = "1" ]; then
  exec node scripts/selfhost-scheduler.mjs
fi
exec pnpm exec vite preview --host 0.0.0.0 --port "${PORT:-3001}"
