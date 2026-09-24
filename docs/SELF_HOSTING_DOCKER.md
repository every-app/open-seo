# Docker Self-Hosting

Run OpenSEO locally with Docker.

In Docker mode, OpenSEO uses `AUTH_MODE=local_noauth` (no auth checks, local admin user `admin@localhost`). Only expose it behind your own auth-protected reverse proxy, tunnel, or private network.

The default `compose.yaml` uses the published GHCR image:

- `ghcr.io/every-app/open-seo:latest`

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- A DataForSEO API key only if you want DataForSEO-backed research features

## Quickstart

```bash
cp .env.example .env
```

For DataForSEO-backed keyword, rank, backlink, business, and AI visibility data, set `DATAFORSEO_API_KEY` in `.env` using the [DataForSEO setup guide](./DATAFORSEO_API_KEY.md). The site crawler, Search Console integration, and AI Discoverability check can run without it. Start OpenSEO:

```bash
docker compose up -d
```

Open `http://localhost:<PORT>` (default `3001`). The first start builds the app and may take 1-2 minutes; follow progress with `docker compose logs -f`.

Optional env values:

- `PORT` (defaults to `3001`)
- `ALLOWED_HOST` (single reverse-proxy hostname to allow in Vite preview)
- `AUTH_MODE=local_noauth` (already set in compose)
- `OPEN_SEO_IMAGE` (defaults to `ghcr.io/every-app/open-seo:latest`)
- `OPENROUTER_API_KEY` (required for AI features such as SAM; see [OpenRouter](https://openrouter.ai/settings/keys))

## Local Lighthouse without DataForSEO

To run Lighthouse audits on your own Docker host, build this repository's app image and start the optional private Chromium runner:

```bash
docker build -f Dockerfile.selfhost -t open-seo:local .
```

Set these values in `.env`:

```dotenv
OPEN_SEO_IMAGE=open-seo:local
LOCAL_LIGHTHOUSE_URL=http://lighthouse-runner:4181
```

Then start both services:

```bash
docker compose --profile local-lighthouse up -d --build
```

With no `DATAFORSEO_API_KEY`, site audits use the local runner for mobile and desktop Lighthouse checks. The runner has no published host port and runs one Chromium check at a time, so an audit can take longer than a DataForSEO-backed one. Its Compose service has a 2 GB memory limit. Other DataForSEO-backed research views still require their own data source.

The project’s **AI Discoverability** page checks a public URL’s `robots.txt` rules for search and AI crawlers, then records the HTTP response and basic page signals visible from the OpenSEO server. This is a readiness check, not a measurement of mentions in ChatGPT or other AI answers. A hosting firewall can challenge the server even when `robots.txt` allows crawlers; check your hosting provider’s bot logs when the page fetch reports a challenge.

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
docker build -f Dockerfile.selfhost -t open-seo:local .
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

## Health and troubleshooting

Startup checks appear in `docker compose logs` before the build. Once running, `/api/health` reports configuration and database status, and `docker compose ps` reports container health.

## Troubleshooting environment variables

To confirm Docker Compose is using the expected environment variables:

```bash
docker compose config
```

Check that `AUTH_MODE=local_noauth`. If you use DataForSEO, check that
`DATAFORSEO_API_KEY` is the base64-encoded value of your DataForSEO email and
API password in this format: `email:password`.

If you changed `.env`, recreate the container so Compose reapplies it:

```bash
docker compose up -d --force-recreate open-seo
```
