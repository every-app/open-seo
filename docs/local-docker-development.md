# Local Docker Development (Cloudflare/Wrangler Runtime)

Run the full OpenSEO dev server inside Docker with the same Cloudflare Workers
local runtime (wrangler + `vite-plugin-cloudflare`) used in production: local
D1, local R2, local KV, local Durable Objects and Workflows — no Cloudflare
account required.

This is an alternative to the bare-metal flow in
[`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md). Prefer it when you want the
platform bindings (R2 cache, D1, workflows) to behave exactly like production
without installing Node tooling, or when you need a clean, disposable
environment.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or any
  Docker Engine with Compose v2)
- No Node.js/pnpm needed on the host — the image is `node:22-bookworm` with
  corepack pnpm

## Quick Start

```sh
cp .env.docker.example .env.docker   # optional; defaults work without it

pnpm dev:docker                      # build + up + follow logs
```

Open http://localhost:3001 (change the port with `PORT=3002 pnpm dev:docker`).
The container is reachable at `127.0.0.1:${PORT}` only.

## How It Works

- `compose.dev.yaml` mounts the repository into `/app` (bind mount) so code
  edits hot-reload; `node_modules`, `.wrangler`, and the pnpm store live in
  named volumes and survive container recreation.
- The entrypoint (`docker-entrypoint.dev.sh`) installs dependencies if the
  volume is empty, applies local D1 migrations (`pnpm run db:migrate:local`,
  no-op when already applied), then runs `pnpm exec vite dev --host 0.0.0.0`.
- Vite must bind `0.0.0.0` so the container port is reachable from the host
  (the default binds an IPv6 loopback only).
- `--host 0.0.0.0` and the watcher polling flags are set by the entrypoint;
  file-watching polls are off by default (`CHOKIDAR_USEPOLLING=false`,
  `WATCHPACK_POLLING=false`) — on Windows/Mac bind mounts polling causes high
  CPU; flip them to `true` in the compose file if HMR does not pick up changes
  on your machine.

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev:docker` | `docker compose -f compose.dev.yaml up --build` (foreground logs) |
| `pnpm dev:docker:down` | Stop the container (`down`) |
| `pnpm dev:docker:logs` | Tail logs from a running container |
| `pnpm dev:docker:reset` | `down -v` — wipe the volumes (fresh node_modules + fresh local D1/R2 state) |

## Environment

`compose.dev.yaml` reads `.env.docker` if present (copy
`.env.docker.example`). Key defaults for local dev:

| Variable | Default | Meaning |
|----------|---------|---------|
| `AUTH_MODE` | `local_noauth` | No auth, single admin user |
| `PORT` | `3001` | Host port (container always runs on 3001 internally) |
| `DATAFORSEO_ENABLED` | `false` | Keep paid DataForSEO off in local dev |
| `GOOGLE_ADS_ENABLED` / `GOOGLE_SEARCH_CONSOLE_ENABLED` / `BING_WEBMASTER_ENABLED` | `false` | Third-party providers off |
| `LOCAL_CRAWLER_ENABLED` | `true` | Site-audit crawler runs locally |

Set `DATAFORSEO_API_KEY` etc. in `.env.docker` when you need to exercise the
DataForSEO provider locally (billing applies — see
[`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md)).

## In-App AI Agent (SAM)

SAM reads its model configuration from the settings UI (global setting on the
Settings page, per-project override on the project settings page) and falls
back to these environment variables:

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENROUTER_API_KEY` | *(none)* | Server-side credential for model calls. Without it, SAM responds with a billing/configuration notice instead of running |
| `OPENROUTER_MODEL` | `minimax/minimax-m3` | Fallback model when no settings row is saved |
| `AI_AGENT_MODEL` | *(none)* | Preferred env fallback — takes precedence over `OPENROUTER_MODEL` |
| `AI_AGENT_MAX_STEPS` | `48` | Think turn step bound |
| `AI_AGENT_MAX_TOOL_CALLS` | `24` | Tool-call cap per turn (bounded-loop guard) |

To run SAM locally, add your key to `.env.docker` (a valid OpenRouter key, not
a placeholder), then restart the container:

```sh
echo "OPENROUTER_API_KEY=sk-or-v1-..." >> .env.docker
pnpm dev:docker:down
pnpm dev:docker
```

The key never leaves the server: the UI only shows a masked status and lets
you test the connection, and model calls are billed to your OpenRouter account
(not to OpenSEO usage credits). The model catalog is fetched from OpenRouter
and cached server-side for 12 hours.

## Verifying It Works

```sh
curl -s http://127.0.0.1:3001/api/health   # {"status":"ok", ...}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/   # 200
```

- First boot applies D1 migrations and prints `VITE ready in ~40s`.
- Local state lives in the `.wrangler` volume: D1 SQLite under
  `.wrangler/state/v3/d1`, R2 under `.wrangler/state/v3/r2`, KV under
  `.wrangler/state/v3/kv`. `pnpm dev:docker:reset` wipes all of it.
- The MCP endpoint is live at `/mcp` (initialize + 24 tools registered).

## Troubleshooting

- **Port already in use**: something else holds `${PORT}` on the host
  (e.g. a bare-metal `pnpm dev`). Stop it or pick another port:
  `PORT=3002 pnpm dev:docker`.
- **Changes not hot-reloading**: set `CHOKIDAR_USEPOLLING=true` and
  `WATCHPACK_POLLING=true` in the compose `environment:` block.
- **D1 migrations prompt hanging**: the entrypoint pipes `yes |` into the
  migration command; if you run migrations manually inside the container,
  use `yes | pnpm run db:migrate:local`.
- **pnpm "ignored build scripts" warning on first install**: benign —
  `workerd`/`esbuild` ship platform binaries via optional dependencies.
