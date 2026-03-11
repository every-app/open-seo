# Docker Self-Hosting

Run OpenSEO locally with Docker.

In Docker mode, OpenSEO uses `AUTH_MODE=local_noauth` (no auth checks, local admin user `admin@localhost`).

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

## Quickstart

```bash
cp .env.example .env
docker compose up
```

Set `DATAFORSEO_API_KEY` in `.env`, then open `http://localhost:<PORT>` (default `3001`).

Optional env values:

- `PORT` (defaults to `3001`)
- `AUTH_MODE=local_noauth` (already set in compose)

## Common commands

- Restart service after env changes:

```bash
docker compose up -d open-seo
```

- Rebuild image (after dependency or Docker config changes):

```bash
docker compose up --build
```

- Stop:

```bash
docker compose down
```

- Stop and remove volumes:

```bash
docker compose down -v
```
