# Docker Self-Hosting

Run OpenSEO on your own server or computer with Docker Compose. The image is prebuilt (`ghcr.io/every-app/open-seo-standalone`), so OpenSEO is ready a few seconds after it starts. You sign in with email and password accounts: the first visitor creates the administrator's account and teammates join from invitation links. You pay DataForSEO, OpenRouter and any rendering provider directly.

Already running the older single-container image (`ghcr.io/every-app/open-seo`)? It keeps getting updates. When you are ready, [move to this setup](#move-from-the-old-docker-image); your data comes with you.

## Install

You need Docker Engine or Docker Desktop with Compose, at least 4 GiB of memory for Docker, and a [DataForSEO API key](./DATAFORSEO_API_KEY.md). Every command below runs from the repository root:

```sh
git clone https://github.com/every-app/open-seo.git
cd open-seo
export COMPOSE_FILE=deploy/standalone/compose.yaml
cp deploy/standalone/.env.example deploy/standalone/.env
```

In `deploy/standalone/.env`, set `STORAGE_SECRET_KEY` to a unique random value (for example the output of `openssl rand -hex 32`) and `DATAFORSEO_API_KEY` to your key. Leave `BETTER_AUTH_URL=http://localhost:3001` for use on this machine. Then start OpenSEO:

```sh
docker compose pull
docker compose up -d
docker compose logs -f init
```

Wait for `OpenSEO initialized and ready.`, open <http://localhost:3001> and create the administrator's account. Registration closes once that account exists, so create it before you put the installation on the internet.

### Coolify, Portainer and Dokploy

`deploy/standalone/compose.yaml` reads no other files from the repository, so you can paste it into a platform that runs Compose files, with the variables from `deploy/standalone/.env.example`. Point the platform's domain at the `web` service on port 80 and set `BETTER_AUTH_URL` to that `https://` address. The `init` service exits after each start by design.

## Accounts

Invite teammates from Team settings. The app copies an invitation link; the invited address creates its own account from that link and joins your workspace. There is no email delivery, so send the link yourself.

Password resets and accounts outside the invitation flow are done from a terminal with the admin command. This Bash example keeps the password out of shell history:

```bash
read -rs -p 'New password: ' password; echo
printf '%s\n' "$password" | pnpm standalone:admin reset-password you@example.com
unset password
```

`create-user you@example.com 'Your name'` creates an account the same way. A reset signs that user out everywhere. Without pnpm, run `docker compose exec -T runtime node /opt/standalone/admin.mjs ...` instead.

### Without sign-in (advanced)

`AUTH_MODE=local_noauth` runs OpenSEO without sign-in, as one admin user. Use it only where the network already controls who can reach the app, for example on a private network, behind Tailscale or behind your own authenticating proxy. To switch an existing installation to accounts later, set `AUTH_MODE=password`, run `docker compose up -d --force-recreate init web crawl-gateway`, and give the admin an email and password; its data and conversations stay:

```sh
pnpm standalone:admin claim-legacy-user local-admin you@example.com delegated-local-admin
```

## Enable features

Set credentials in `deploy/standalone/.env`, then apply them without rebuilding:

```sh
docker compose up -d --force-recreate init web crawl-gateway
```

| Variable                                   | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `DATAFORSEO_API_KEY`                       | Base64-encoded `login:password`; keyword, backlink, rank and site data       |
| `OPENROUTER_API_KEY`                       | SAM conversations, website research and summaries                            |
| `OPENROUTER_MODEL`                         | Optional model override                                                      |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Search Console and Analytics linking with your own Google OAuth app |
| `CONTEXT_API_KEY`                          | Optional JavaScript rendering for site audits                                |

For Google, register your own OAuth application with these redirect URLs under your public address: `/api/gsc/oauth/callback` for Search Console and `/api/ga4/oauth/callback` for Analytics. See [`SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md). Signing in with Google is not offered; accounts use email and password.

Site audits can crawl up to 10,000 pages (1,000 with JavaScript rendering), with no lifetime quota. Costs are what the providers charge, with no OpenSEO markup.

MCP clients connect to `/mcp` and sign in with your OpenSEO account, or use an API key from Settings. Clients that register with a metadata URL (CIMD) are not supported; use dynamic client registration or an API key.

## Public HTTPS

Set `BETTER_AUTH_URL=https://seo.example.com` before the first start, or run `docker compose up -d --force-recreate init web crawl-gateway` after changing it. Put an HTTPS reverse proxy in front of `127.0.0.1:3001` and forward WebSocket upgrades for SAM. Plain HTTP is accepted only for `localhost`.

Only Nginx is published, and only on the host's loopback address; storage, the crawl gateway and the runtime stay private. Crawls reach public addresses on ports 80 and 443 only; crawling private sites is intentionally unsupported.

## Updates

Make a backup, then pull the new image and restart:

```sh
node scripts/celld/backup.mjs backup ./backups/before-update
docker compose pull
docker compose stop web crawl-gateway runtime
docker compose up -d
docker compose logs init
```

Database migrations run in `init`. Going back to an older image does not undo them; restore the matching backup instead.

To run your own changes instead of the published image, add the build file:

```sh
export COMPOSE_FILE=deploy/standalone/compose.yaml:deploy/standalone/compose.build.yaml
docker compose up -d --build
```

## Backup and restore

A backup briefly stops the app, archives the storage and configuration volumes with checksums, then starts it again:

```sh
node scripts/celld/backup.mjs backup ./backups/2026-10-19
```

Backups contain credentials and user data; keep them somewhere private. Restore into a stopped, empty installation with the same storage credentials:

```sh
node scripts/celld/backup.mjs restore ./backups/2026-10-19
docker compose up -d
```

Restore refuses a non-empty volume and verifies the checksums. To test a restore beside a live installation, use a different `COMPOSE_PROJECT_NAME` and `PORT`.

The `config` volume holds the secrets generated at the first start. Keep it in your backups; nothing secret is built into the image.

## Move from the old Docker image

The older image (`ghcr.io/every-app/open-seo`) keeps its data in a volume named `open_seo_data`, in a format this setup cannot read directly. A one-time `migrate` service copies it over. It carries projects, saved keywords, rank trackers and their history, audits, reports and SAM conversations. It does not carry Google connections, sessions, API keys or MCP connections, provider caches, or work that is still running.

1. Update the old installation and start it once (`docker compose pull && docker compose up -d` in its directory). Let running audits, rank checks and SAM replies finish.
2. Stop it with `docker compose down`. The data volume stays; find its name with `docker volume ls`. For a checkout in a directory called `open-seo` it is `open-seo_open_seo_data`.
3. Update the checkout (`git pull`), then prepare `deploy/standalone/.env` as in [Install](#install), but do not start it yet. Set `LEGACY_VOLUME` to the volume name. Set `AUTH_MODE=local_noauth` to keep working without sign-in, or leave `AUTH_MODE=password` to switch to accounts.
4. Start it with the migration file added:

   ```sh
   export COMPOSE_FILE=deploy/standalone/compose.yaml:deploy/standalone/compose.migrate.yaml
   docker compose pull --ignore-buildable
   docker compose up -d --build
   docker compose logs -f migrate
   ```

   The app opens once the copy has finished. Starting again with the same files changes nothing. When it reports success, set `COMPOSE_FILE` back to `deploy/standalone/compose.yaml`.

5. Without sign-in, open the app: everything is where it was. With accounts, give the old admin an email and password: `pnpm standalone:admin claim-legacy-user local-admin you@example.com delegated-local-admin`, with the password on standard input as in [Accounts](#accounts).
6. Check your projects and reports, then reconnect Google and review schedules.

Keep the old volume until you are satisfied; only `docker volume rm` deletes it. If the copy stops partway, starting again resumes it. When the old volume is on another machine, run `node scripts/celld/export-legacy.mjs COPIED_STATE_V3 OUTPUT_DIR` from a checkout there and import the directory with `node /opt/standalone/import.mjs` inside the `init` container.

To hand the move to a coding agent, give it this:

```text
Move my OpenSEO Docker installation from the old image (ghcr.io/every-app/open-seo) to the new Docker setup, following "Move from the old Docker image" in docs/SELF_HOSTING_DOCKER.md of this checkout. Update the old installation first and let its running work finish, stop it, find its data volume, prepare deploy/standalone/.env (keep AUTH_MODE=local_noauth unless I say otherwise), run the migration, and then tell me what was not migrated and what I need to reconnect. Do not delete the old volume.
```

## Troubleshooting

```sh
docker compose ps
docker compose logs --tail 100 init runtime storage crawl-gateway web
curl --fail http://localhost:3001/api/health
```

`/api/health` succeeds only when sign-in is configured and the database answers. If `init` fails, Nginx does not start; its log says why. `docker compose down -v` deletes the installation's data and secrets.

## How it works

OpenSEO is written for Cloudflare Workers. In Docker it runs on [celld](https://github.com/denoland/celld), an open-source runtime for Workers code, which provides the same database, storage, background workflows and scheduled jobs on your own machine. [RustFS](https://github.com/rustfs/rustfs) stores that state, Nginx serves the app, and a small crawl gateway keeps site crawls away from private network addresses. `init` runs once at each start: it generates secrets on the first run, loads the app and applies database migrations.

The runtime container is limited to 2 GiB of memory, and the whole stack typically uses 1 to 2 GiB. Adjust `mem_limit` in `deploy/standalone/compose.yaml` if you need to.
