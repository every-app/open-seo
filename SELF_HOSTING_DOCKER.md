# Docker Self-Hosting

This guide runs both Every App Gateway and OpenSEO with one Docker Compose command.

OpenSEO is an app built on Every App so things like authentication and user management are delegated to the Gateway. Every App is built with deployment to Cloudflare as its target with the goal of making self hosting more accessible to people not already running home labs. Because of that design principle, self hosting with docker is a bit complicated right now, but will hopefully will get smoother over time.

The stack uses local Cloudflare-compatible runtime behavior (`wrangler` + Vite/worker runtime) so bindings and auth behavior stay close to Workers while running on your own machine or server.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

## Runtime model

- OpenSEO runs from this repository source in containerized local runtime mode.
- Gateway is built from `apps/every-app-gateway` source at a release tag in https://github.com/every-app/every-app

Default gateway release policy:

- Source: `every-app/every-app` releases
- Tag: latest release (recommended)

You can optionally pin to a specific release by setting `GATEWAY_RELEASE_TAG` in your env file.

## Security and runtime caveats

This stack runs local dev servers to emulate Cloudflare Worker bindings — this is currently the best way to self-host outside Cloudflare, but it means dev-only surfaces (HMR, verbose errors, broader file-serving) are exposed on the serving ports. Do not expose these ports directly to the public internet. If you need remote access, use [Tailscale](https://tailscale.com/) instead of a public tunnel. For internet-facing deployments, use the [Cloudflare deployment path](./README.md#self-hosting-deploy-on-cloudflare-5-10-minutes).

## 1) Configure env values

From the repository root:

```bash
cp .env.example .env.local
```

Set values as needed in `.env.local`.

Important values:

- `GATEWAY_URL` and `VITE_GATEWAY_URL` should be set to `http://every-app-gateway.localhost:3000` for local Docker networking and JWT issuer consistency.
  - Add a host entry for `every-app-gateway.localhost` if needed:
    - macOS/Linux: add `127.0.0.1 every-app-gateway.localhost` to `/etc/hosts`
    - Windows: add `127.0.0.1 every-app-gateway.localhost` to `C:\Windows\System32\drivers\etc\hosts`
  - If you use a different host or port, set both `GATEWAY_URL` and `VITE_GATEWAY_URL` to the same origin.
- `DATAFORSEO_API_KEY` is required for OpenSEO SEO-data workflows.
  - See [README: DataForSEO API Key Setup](./README.md#dataforseo-api-key-setup-5-minutes).
- `BETTER_AUTH_SECRET`, `JWT_PRIVATE_KEY`, and `JWT_PUBLIC_KEY` are required for gateway auth (see how to generate them below)

Generate auth values with:

```bash
pnpm run docker:generate-secrets
```

Copy the printed lines into `.env.local`.

Validate env before startup:

```bash
pnpm run docker:check-env
```

## 2) Start both services with one command

```bash
pnpm run docker:up
```

URLs:

- Gateway: `http://every-app-gateway.localhost:3000`
- OpenSEO: `http://localhost:3001`

Gateway boot behavior:

- Resolves the latest gateway release tag (unless explicitly pinned).
- Pulls gateway source for that tag, installs dependencies during image build, and runs in local runtime mode.
- Applies local D1 migrations on start.
- Persists local gateway Wrangler/D1 state in Docker volume `every_app_gateway_wrangler_state`.

OpenSEO boot behavior:

- Uses dependencies installed during image build, then applies local D1 migrations on start.
- Starts local dev runtime (Vite). See [Security and runtime caveats](#security-and-runtime-caveats) above.

## 3) Bootstrap Gateway and app access

1. Open `http://every-app-gateway.localhost:3000/sign-up` and create the owner account.
2. In Gateway admin (`/admin/apps`), add OpenSEO:
   - App ID: `open-seo`
   - App URL: `http://localhost:3001`
   - Or whatever port you have this running at
3. Start using OpenSEO by accessing it through Gateway: `http://every-app-gateway.localhost:3000/`.

## Optional: Run only one service

Run gateway only:

```bash
pnpm run docker:check-env
docker compose -f self-host/docker-compose.yml --env-file .env.local up --build gateway
```

Run OpenSEO only (expects gateway already reachable at `GATEWAY_URL`):

```bash
pnpm run docker:check-env
docker compose -f self-host/docker-compose.yml --env-file .env.local up --build open-seo
```

## Updating gateway version

By default this stack pulls the latest published gateway release (recommended).

To pin to a specific gateway release instead:

1. Set `GATEWAY_RELEASE_TAG` in `.env.local` (for example `gateway-v0.1.11`).
2. Rebuild gateway:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local build --no-cache gateway
docker compose -f self-host/docker-compose.yml --env-file .env.local up -d gateway
```

When tracking latest, rebuild gateway with `--no-cache` to pull newer gateway source for the latest tag.

## Troubleshooting

- `Issuer must be provided` or `signature verification failed`: make sure `GATEWAY_URL` and `VITE_GATEWAY_URL` both point to `http://every-app-gateway.localhost:3000`, then clear browser cookies/storage for `localhost` and `every-app-gateway.localhost` and sign in again.
- OpenSEO env values seem stale: restart OpenSEO:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local up -d --build open-seo
```

## Stop and cleanup

Stop stack:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local down
```

Stop and remove Docker volumes:

```bash
docker compose -f self-host/docker-compose.yml --env-file .env.local down -v
```

To reset only the gateway local DB state explicitly:

```bash
docker volume rm every_app_gateway_wrangler_state
```
