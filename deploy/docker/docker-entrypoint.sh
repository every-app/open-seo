#!/bin/sh
# Self-host container entrypoint. vite build inlines the envPrefix'd client
# envs (see vite.config.ts) into the bundle, so the build must run at container
# start — but the output stays valid until those envs or the image change.
# Fingerprint them and skip the build when the last start's output matches; an
# image update lands a fresh container with no build output, so new code always
# rebuilds.
set -e

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

# ---------------------------------------------------------------------------
# Serve.
#
# workerd — the runtime `vite preview` serves the app through — retains a
# little anonymous memory per request and never garbage-collects it (~80 MiB
# per 1000 requests; upstream: cloudflare/workerd#6894 — per-invocation
# V8-wrapped native objects whose native weight is invisible to V8's GC).
# Under steady traffic from even a health probe, a memory-limited container
# climbs to its limit and is OOM-killed. Until upstream fixes GC accounting,
# the watchdog below recycles the server gracefully once the container's
# cgroup memory crosses 90% of its limit: a few seconds of downtime instead
# of a hard kill. Override the threshold (bytes), or set it to "off" to
# disable the watchdog, with SELF_HOST_MEMORY_RECYCLE_BYTES. The default
# check interval is 60s; tune it with SELF_HOST_MEMORY_CHECK_INTERVAL.
# SELF_HOST_CGROUP_PATH repoints the watchdog at a nonstandard cgroup mount.
CGROUP_BASE="${SELF_HOST_CGROUP_PATH:-/sys/fs/cgroup}"
MEMORY_CHECK_INTERVAL="${SELF_HOST_MEMORY_CHECK_INTERVAL:-60}"
# A non-numeric interval would make `sleep` fail and the watchdog busy-loop.
case "$MEMORY_CHECK_INTERVAL" in
  ''|*[!0-9]*) MEMORY_CHECK_INTERVAL=60 ;;
esac
RECYCLE_BYTES="${SELF_HOST_MEMORY_RECYCLE_BYTES:-}"

if [ -z "$RECYCLE_BYTES" ]; then
  if [ -f "$CGROUP_BASE/memory.max" ]; then
    # cgroup v2 (Docker 20+, current Kubernetes nodes).
    MEMORY_USAGE_FILE="$CGROUP_BASE/memory.current"
    LIMIT_BYTES="$(cat "$CGROUP_BASE/memory.max")"
  elif [ -f "$CGROUP_BASE/memory/memory.limit_in_bytes" ]; then
    # cgroup v1 fallback.
    MEMORY_USAGE_FILE="$CGROUP_BASE/memory/memory.usage_in_bytes"
    LIMIT_BYTES="$(cat "$CGROUP_BASE/memory/memory.limit_in_bytes")"
  else
    LIMIT_BYTES=""
  fi
  # "max" (v2 unlimited) or an unparsable value disables the watchdog.
  case "$LIMIT_BYTES" in
    ''|*[!0-9]*) LIMIT_BYTES="" ;;
  esac
  if [ -n "$LIMIT_BYTES" ]; then
    RECYCLE_BYTES=$(( LIMIT_BYTES * 90 / 100 ))
  fi
elif [ ! -f "$CGROUP_BASE/memory.max" ] && [ ! -f "$CGROUP_BASE/memory/memory.limit_in_bytes" ]; then
  # An explicit threshold with no readable cgroup would silently never fire.
  echo "Memory watchdog warning: SELF_HOST_MEMORY_RECYCLE_BYTES is set but no cgroup memory files were found under $CGROUP_BASE; the watchdog will never fire. Set SELF_HOST_CGROUP_PATH if the cgroup is mounted elsewhere."
fi
# A bad override disables the watchdog rather than crashing arithmetic below.
case "$RECYCLE_BYTES" in
  ''|*[!0-9]*) RECYCLE_BYTES="" ;;
esac

if [ -n "$RECYCLE_BYTES" ]; then
  echo "Memory watchdog: recycling the server when cgroup memory reaches ${RECYCLE_BYTES} bytes (checked every ${MEMORY_CHECK_INTERVAL}s)."
else
  echo "Memory watchdog disabled: no cgroup memory limit detected. Set SELF_HOST_MEMORY_RECYCLE_BYTES to enable."
fi

RECYCLE_MARKER="/tmp/.openseo-memory-recycle"
LAST_RECYCLE_AT=0
RECYCLE_EXIT=0
# docker stop / Ctrl-C: take the server (and its workerd child) down, then exit.
# The trap must reap the watchdog before exiting, or a TERM racing the wait on
# the server leaves that child running behind the entrypoint's exit.
trap 'pkill -TERM -P "${SERVER_PID:-}" 2>/dev/null || true; kill -TERM "${SERVER_PID:-}" "${WATCHDOG_PID:-}" 2>/dev/null || true; wait "${WATCHDOG_PID:-}" 2>/dev/null || true; exit 143' TERM INT
while :; do
  rm -f "$RECYCLE_MARKER"
  # Run vite directly (not via pnpm) so the watchdog's kill reaches the server
  # process itself; pkill -P takes out its workerd child, whose leaked memory
  # is the point of the recycle.
  node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port "${PORT:-3001}" &
  SERVER_PID=$!
  (
    [ -n "$RECYCLE_BYTES" ] || exit 0
    while :; do
      sleep "$MEMORY_CHECK_INTERVAL"
      USAGE="$(cat "$MEMORY_USAGE_FILE" 2>/dev/null || true)"
      case "$USAGE" in
        ''|*[!0-9]*) continue ;;
      esac
      if [ "$USAGE" -ge "$RECYCLE_BYTES" ]; then
        : > "$RECYCLE_MARKER"
        pkill -TERM -P "$SERVER_PID" 2>/dev/null || true
        kill -TERM "$SERVER_PID" 2>/dev/null || true
        break
      fi
    done
  ) &
  WATCHDOG_PID=$!

  wait "$SERVER_PID" || RECYCLE_EXIT=$?
  kill "${WATCHDOG_PID:-}" 2>/dev/null || true
  wait "${WATCHDOG_PID:-}" 2>/dev/null || true

  if [ ! -f "$RECYCLE_MARKER" ]; then
    # Real stop or crash — propagate the status to the restart policy.
    exit "$RECYCLE_EXIT"
  fi

  NOW="$(date +%s)"
  if [ "$(( NOW - LAST_RECYCLE_AT ))" -lt 600 ]; then
    echo "Memory watchdog recycled twice within 10 minutes; the memory limit is likely below the app's baseline. Giving up."
    exit 1
  fi
  LAST_RECYCLE_AT="$NOW"
  echo "Memory watchdog: threshold reached — recycling the server (leaked workerd memory dies with the process)."
  RECYCLE_EXIT=0
done
