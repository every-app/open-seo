# Docker Self-Hosting

Run OpenSEO locally with Docker.

In Docker mode, OpenSEO uses `AUTH_MODE=local_noauth` (no auth checks, local admin user `admin@localhost`). Only expose it behind your own auth-protected reverse proxy, tunnel, or private network.

The default `compose.yaml` uses the published GHCR image:

- `ghcr.io/every-app/open-seo:latest`

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- A DataForSEO API key (see [`DATAFORSEO_API_KEY.md`](./DATAFORSEO_API_KEY.md))

## Quickstart

```bash
cp .env.example .env
```

Set `DATAFORSEO_API_KEY` in `.env` using the [DataForSEO setup guide](./DATAFORSEO_API_KEY.md), then start OpenSEO:

```bash
docker compose up -d
```

Open `http://localhost:<PORT>` (default `3001`). The first start builds the app and may take 1-2 minutes; follow progress with `docker compose logs -f`.

Optional env values:

- `PORT` (defaults to `3001`)
- `ALLOWED_HOST` (single reverse-proxy hostname to allow in Vite preview)
- `AUTH_MODE=local_noauth` (already set in compose)
- `OPEN_SEO_IMAGE` (defaults to `ghcr.io/every-app/open-seo:latest`)

If you are putting Docker behind a reverse proxy or a temporary tunnel, remember that Docker self-hosting runs with app auth disabled. Only expose it behind your own auth-protected reverse proxy, tunnel, or private network, and add the public hostname before restarting:

```bash
ALLOWED_HOST=yourdomain.com docker compose up -d
```

You can also persist it in `.env`.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. Telemetry also includes failed setup check names and statuses, never values or error messages. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

Heartbeats are triggered by requests to the app or MCP server. Requests to `/api/health`, including Docker's automatic health checks, do not trigger telemetry.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) in `.env`, then run `docker compose up -d --force-recreate open-seo`.

## Pin to a specific image tag

Set `OPEN_SEO_IMAGE` in `.env` and restart:

```bash
OPEN_SEO_IMAGE=ghcr.io/every-app/open-seo:v1.2.3
docker compose up -d
```

## Build your own image locally

If you are testing local code changes, build and run a local tag:

```bash
docker build -f deploy/docker/Dockerfile -t open-seo:local .
OPEN_SEO_IMAGE=open-seo:local docker compose up -d
```

## Common commands

- Restart service after env changes:

```bash
docker compose up -d open-seo
```

- Pull latest published image and restart:

```bash
docker compose pull && docker compose up -d
```

- Stop:

```bash
docker compose down
```

## Memory limits and the recycle watchdog

Under sustained HTTP traffic (Kubernetes health probes are enough on their own), the
server's memory grows slowly and is never returned — roughly 80 MiB per 1000 requests,
regardless of the route. This is a garbage-collection accounting bug in workerd, the
runtime the image serves the app through (tracked upstream at
[cloudflare/workerd#6894](https://github.com/cloudflare/workerd/issues/6894)); it is
not caused by the app's own request handling, and it affects every OpenSEO version.

To keep a memory-limited container from being OOM-killed, the container runs a watchdog
that recycles the server process gracefully once the container's cgroup memory reaches
90% of its limit (checked every 60 seconds). A recycle costs a few seconds of downtime,
and the standard `restart: unless-stopped` / Kubernetes restart policy brings the server
right back — a few seconds of downtime instead of a hard OOM kill. There is no data loss:
all state lives in the database, and in-flight requests are few because the recycle
starts only when memory is nearly exhausted.

To tune this behavior, set any of the following (via `.env` for Compose, or the container
environment elsewhere):

- `SELF_HOST_MEMORY_RECYCLE_BYTES` — recycle threshold in bytes. By default it is 90% of
  the container's cgroup memory limit; set it explicitly when the limit is imposed
  outside the container (Kubernetes does exactly that) and the cgroup limit is not
  visible inside. Set to `off` to disable the watchdog entirely.
- `SELF_HOST_MEMORY_CHECK_INTERVAL` — seconds between memory checks (default `60`).
- `SELF_HOST_CGROUP_PATH` — cgroup mount to read, for hosts that do not mount it at
  `/sys/fs/cgroup` (default).

If the memory limit sits below the app's baseline footprint, a recycle cannot help; the
watchdog notices two recycles inside 10 minutes and exits so the restart policy's normal
backoff applies. Size the container for at least the app's baseline (roughly 600 MiB
plus your workload's needs).

## Health and troubleshooting

Startup checks appear in `docker compose logs` before the build. Once running, `/api/health` reports configuration and database status, and `docker compose ps` reports container health.

## Troubleshooting environment variables

To confirm Docker Compose is using the expected environment variables:

```bash
docker compose config
```

Check that `AUTH_MODE=local_noauth`, and that `DATAFORSEO_API_KEY` is the base64
encoded value of your DataForSEO email and API password in this format:
`email:password`.

If you changed `.env`, recreate the container so Compose reapplies it:

```bash
docker compose up -d --force-recreate open-seo
```
