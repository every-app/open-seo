#!/bin/sh
# Local development container entrypoint for OpenSEO (Docker Desktop).
#
# Unlike docker-entrypoint.sh (self-host: preflight, migrate, build, preview),
# this runs the project's normal Wrangler/Cloudflare local dev runtime:
# `pnpm dev` (Vite + @cloudflare/vite-plugin → workerd), with local D1/R2
# bindings resolved from wrangler.jsonc. Bind-mounted source means hot reload
# works and no container rebuild is needed for code changes.

set -e

cd /app

# Bind-mounted source trees can arrive without node_modules (fresh clone) or
# with host binaries (Windows/macOS) that workerd can't execute under Linux.
# The image ships a complete Linux node_modules built against the same
# lockfile; we prefer keeping the container's own copy isolated from the mount
# via the compose volume declared in compose.dev.yaml. If it is absent (first
# start before the volume populated), install once into the volume.
if [ ! -d node_modules/.bin ] || [ ! -x node_modules/.bin/vite ]; then
  echo "[dev] Installing dependencies into the container volume..."
  pnpm install --frozen-lockfile --workspace-root
fi

# Local D1 lives in .wrangler/state. Apply migrations against the LOCAL
# database only — identical to `pnpm db:migrate:local`, and intentionally
# separate from production. Safe to re-run: already-applied migrations are
# skipped. `yes` auto-confirms wrangler's interactive "apply N migrations?"
# prompt so the container doesn't hang on stdin.
echo "[dev] Applying local D1 migrations (wrangler d1 migrations apply DB --local)..."
yes | pnpm run db:migrate:local || {
  echo "[dev] D1 migration check skipped (database may not exist on first boot; it will be created by Wrangler)."
}

echo "[dev] Starting OpenSEO dev server (pnpm dev → vite + wrangler/workerd)..."
echo "[dev] App will be available on http://localhost:${PORT:-3001}"

# Hand off to the dev server on 0.0.0.0 so Docker Desktop's port forward can
# reach it (workerd's IPv6-loopback default is unreachable from outside the
# container). `pnpm dev` runs `vite dev`; the Cloudflare vite plugin starts
# workerd with the D1, R2, KV, Durable Object, and Workflow bindings declared
# in wrangler.jsonc. PORT is honoured by vite.config.ts.
exec pnpm exec vite dev --host 0.0.0.0
