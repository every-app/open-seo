# Docker Self-Hosting

This guide runs OpenSEO as a local service without Every App Gateway.

In this mode, OpenSEO runs with `BYPASS_GATEWAY_LOCAL_ONLY=true`, so authentication and Gateway-managed user accounts are disabled.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

## Security and runtime caveats

This stack is local-first and uses dev runtimes to emulate Cloudflare Worker bindings.

- Do not expose these ports directly to the public internet.
- There is no built-in Gateway auth in this mode.
- If you expose it beyond localhost, put it behind the same authentication layer you use for your other self-hosted services (or use the [Cloudflare deployment path](./README.md#self-hosting-deploy-on-cloudflare-5-10-minutes)).

## 1) Configure env values

From the repository root:

```bash
cp .env.example .env
```

Set values as needed in `.env`.

Required:

- `DATAFORSEO_API_KEY`

Optional:

- `PORT` (defaults to `3001`)
- `VITE_APP_ID` (defaults to `open-seo`)
- `BYPASS_GATEWAY_LOCAL_ONLY=true` (Docker compose already sets this)

## 2) Start OpenSEO

```bash
docker compose up
```

URL:

- OpenSEO: `http://localhost:<PORT>` (defaults to `3001`)

Boot behavior:

- Uses dependencies installed during image build.
- Applies local D1 migrations on start.
- Starts local dev runtime (Vite).

## Troubleshooting

- OpenSEO env values seem stale: restart OpenSEO:

```bash
docker compose up -d open-seo
```

- If migrations fail on first run, rebuild and retry:

```bash
docker compose down
docker compose up
```

If you update dependencies or Docker build config, force a rebuild:

```bash
docker compose up --build
```

## Stop and cleanup

Stop stack:

```bash
docker compose down
```

Stop and remove Docker volumes:

```bash
docker compose down -v
```
