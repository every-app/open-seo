# Docker Self-Hosting (Standalone OpenSEO)

This guide runs OpenSEO as a standalone local service without Every App Gateway.

In this mode, OpenSEO runs with `BYPASS_GATEWAY_LOCAL_ONLY=true`, so authentication and Gateway-managed user accounts are disabled.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

## Security and runtime caveats

This stack runs local dev servers to emulate Cloudflare Worker bindings and is intended for local use only.

- Do not expose these ports directly to the public internet.
- There is no Gateway auth in this mode.
- If you need remote access, use [Tailscale](https://tailscale.com/) instead of a public tunnel.
- For internet-facing deployments with auth, use the [Cloudflare deployment path](./README.md#self-hosting-deploy-on-cloudflare-5-10-minutes).

## 1) Configure env values

From the repository root:

```bash
cp .env.example .env.local
```

Set values as needed in `.env.local`.

Required:

- `DATAFORSEO_API_KEY`

Optional:

- `OPENAI_API_KEY`
- `VITE_APP_ID` (defaults to `open-seo`)
- `BYPASS_GATEWAY_LOCAL_ONLY=true` (Docker compose already sets this)

Validate env before startup:

```bash
pnpm run docker:check-env
```

## 2) Start OpenSEO

```bash
pnpm run docker:up
```

URL:

- OpenSEO: `http://localhost:3001`

Boot behavior:

- Uses dependencies installed during image build.
- Applies local D1 migrations on start.
- Starts local dev runtime (Vite).

## Troubleshooting

- OpenSEO env values seem stale: restart OpenSEO:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local up -d --build open-seo
```

- If migrations fail on first run, rebuild and retry:

```bash
pnpm run docker:down
pnpm run docker:up
```

## Stop and cleanup

Stop stack:

```bash
pnpm run docker:down
```

Stop and remove Docker volumes:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local down -v
```
