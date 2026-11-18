# Docker self-hosting

OpenSEO is written for Cloudflare Workers: D1, KV, R2, Durable Objects, Workflows and cron. Docker self-hosting runs that same code, unchanged, on a prebuilt image instead of rebuilding the app and running Cloudflare's local development server inside a container.

## How it works

The image (`deploy/standalone/Dockerfile`, published as `ghcr.io/every-app/open-seo-standalone`) contains the compiled app and [celld](https://github.com/denoland/celld), an open-source runtime for Workers code. celld provides D1 and Durable Objects on SQLite, KV, R2, Workflows and cron, and keeps their state in an S3-compatible bucket. `vite build --mode standalone` produces a single server module, because celld loads one module per deployment, and `scripts/celld/package.mjs` packages it with its assets and migrations.

The Compose stack (`deploy/standalone/compose.yaml`) runs:

- `runtime`: celld with the app.
- `storage`: RustFS, the S3-compatible store for celld's state.
- `init`: runs once at each start. It generates the secrets on the first start, writes the deployment configuration, loads the app, applies database migrations and writes Nginx's site config.
- `crawl-gateway`: the proxy every outbound crawl goes through. It resolves each target, rejects private and reserved addresses, and pins the connection to the address it checked, including on redirects.
- `web`: Nginx, the only published service. It blocks the operator endpoints from outside the stack.

The Compose file reads nothing else from the repository, so Compose-based platforms can run it on its own; `compose.build.yaml` adds the build for people running their own changes.

Sign-in is chosen at the first start with `AUTH_MODE`. `password` gives Better Auth accounts with none of the hosted service's billing, email or telemetry. Registration is open only for the first account and for addresses with a pending invitation. `local_noauth` runs without sign-in as one admin, as the original Docker image did. The server tells the client which mode is running, so one image serves both. Operator commands (create a user, reset a password, claim the old admin) go through an endpoint that requires a secret generated at the first start.

The original single-container image (`deploy/docker/`, `ghcr.io/every-app/open-seo`) keeps being published from the same workflow. Existing installations auto-update from its `:latest` tag and could not run a multi-container stack or read its storage, so the new image never takes that name. That image shows a notice that links to the migration. The `migrate` service in `compose.migrate.yaml` reads the old volume with Miniflare and imports it once into an unused database. It carries projects, keywords, rank history, audits, reports and SAM conversations, and leaves out sessions, API keys, OAuth grants, Google connections and caches.

## Alternatives

Rewriting the server for Node with a job queue and a separate actor system would have removed the Workers dependency, at the cost of a second implementation of every background feature that would drift from the hosted one. celld runs the hosted code as it is.

Keeping the original image and only skipping its startup build would have left Cloudflare's local development server, which is not built for long-running use, as the production runtime.

A separate repository for the Docker edition was planned, carrying its own changes to the app. Keeping one codebase and choosing behavior by `AUTH_MODE` avoids a fork that conflicts with every change to main.

MinIO's community images stopped being published in September 2026. Garage accepts but does not enforce conditional writes, which celld relies on. RustFS passes celld's storage checks.
