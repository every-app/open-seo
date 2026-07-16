# Alchemy preview deployments

OpenSEO preview stages use isolated Cloudflare resources and a shared,
Alchemy-managed Cloudflare Access boundary.

## Security model

- Preview Workers are named `open-seo-<stage>` and served from
  `open-seo-<stage>.<WORKERS_SUBDOMAIN>`.
- One persistent Access application protects
  `open-seo-*.<WORKERS_SUBDOMAIN>` before any preview Worker exists.
- Production uses the unsuffixed `open-seo` Worker on `app.openseo.so` and
  `www.app.openseo.so`. It does not match the preview wildcard and is not
  placed behind preview Access.
- A separate persistent Alchemy stack manages the shared Access boundary. A
  failed preview deploy or teardown therefore cannot remove the gate protecting
  other previews.
- `pnpm preview:access` deploys/reconciles the persistent Access stack —
  one-time setup, safe to re-run. Every CI deploy then verifies the real HTTP
  challenge (a curl check in `pr-preview.yml`, with retries for propagation
  delays) before commenting a URL, so a missing gate fails the job. A preview
  that answers without the challenge is public — destroy the stage
  (`pnpm destroy:preview`); a merely unreachable one can stay, as it still
  sits behind the wildcard application.

## Credentials

Alchemy manages Cloudflare credentials itself — nothing credential-shaped goes
in the env files.

- **Locally**, run `pnpm alchemy login` once. Answer yes to
  **Customize OAuth scopes?** and enable `access:write` on top of the defaults
  (the preview Access gate needs it; add `query_cache:write` too if you will
  deploy production — Hyperdrive). The credential is stored globally, and
  later runs — including non-interactive ones — reuse it silently.
- **State** lives in the account's Cloudflare state store (an
  `alchemy-state-store` Worker with embedded SQLite), shared by every machine
  and CI — provision it once with `pnpm alchemy cloudflare bootstrap`. It
  mints an auth token and encryption key into the account Secrets Store;
  local runs cache credentials under `~/.alchemy/`.
- **In GitHub Actions**, the runner's `CI` env makes alchemy read
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment
  (repo secrets), and resolve the state-store token from the Secrets Store on
  every run. The token needs write access to Workers Scripts, KV, D1, R2, and
  Workflows, plus **Secrets Store read** and **Account Settings read** (both
  used by alchemy's state-store login, which fetches its token through a
  temporary edge-preview worker). CI never touches Access — the gate is
  one-time local setup.

## Cloudflare Access configuration

The persistent Access stack creates a self-hosted application with this public
hostname:

```text
open-seo-*.your-subdomain.workers.dev
```

Use the account's Workers subdomain shown under **Workers & Pages**, not the
Zero Trust team domain. Set that full value in `.env.preview` as
`WORKERS_SUBDOMAIN`. Preview URLs derive from it as
`https://open-seo-<stage>.<WORKERS_SUBDOMAIN>` — hosted previews use that as
`BETTER_AUTH_URL`, and CI's verify step probes it; a wrong value fails the
check. Previews in `local_noauth` or `cloudflare_access` mode deploy without
it, since nothing reads `BETTER_AUTH_URL` there.

Set `ACCESS_ALLOWED_EMAILS` to the exact comma-separated emails that may open
previews:

```env
ACCESS_ALLOWED_EMAILS=you@example.com
```

`pnpm preview:access` deploys the persistent Access stack. It always uses
`--adopt`, so it can recover matching infrastructure if local Alchemy state is
lost — safe to re-run any time. Normal preview teardown only destroys the
requested application stage and cannot touch the Access stack.

## Local preview

```sh
pnpm alchemy login    # once — see Credentials above
cp .env.preview.example .env.preview
pnpm preview:access   # once — the shared Access gate (safe to re-run)
pnpm deploy:preview --stage manual-preview --yes
```

`deploy:preview` builds with Vite's preview mode (`--mode preview` loads
`.env.preview` into the client bundle) and runs `alchemy deploy` against
`.env.preview`; extra flags land on the deploy. CI runs this same command.
Two alchemy conventions to know: omitting `--stage` targets alchemy's default
per-user stage (`dev_$USER`), and stage `hosted-prod` with `.env.preview` fails
in the stack (no `BETTER_AUTH_URL`) — use `pnpm deploy:postgres` for production.

Each preview starts with an empty database: open the URL, pass the Access
challenge, and you're in. Previews default to `AUTH_MODE=local_noauth`, so
everyone allowed through the gate shares one auto-created admin account — set
`AUTH_MODE=hosted` in `.env.preview` (see the example file) to exercise the
real sign-up flow instead.

Destroy the stage (state is shared via the Cloudflare state store, so any
machine with credentials can do this):

```sh
pnpm destroy:preview --stage manual-preview --yes
```

## CI

`.github/workflows/pr-preview.yml` deploys stage `pr-<n>` for every
private-repo PR (then verifies the Access challenge before commenting the
URL) and destroys it when the PR closes, running the same commands as local
deploys. State is shared through the Cloudflare state store, so CI runs and
local machines see the same stages — a straggler can always be destroyed
locally with `pnpm destroy:preview --stage pr-<n> --yes`.

## Public-mirror PRs

External (every-app/open-seo) PRs never deploy from CI — fork code must not
run with deploy secrets. Preview one locally instead: the fork's code only
BUILDS, in a detached sibling worktree, and the deploy runs from this trusted
checkout's alchemy stack against the fork's `dist/`. The fork's own deploy
scripts never execute (fork PRs may also predate the alchemy setup entirely).
Read the PR's diff for the build-executable surface first — `package.json`,
the lockfile, `vite.config*`, `scripts/`, `patches/`, `.npmrc` — because
building executes the fork's config code on your machine with `.env.preview`
available.

```sh
git fetch https://github.com/every-app/open-seo.git pull/<pr>/head
git worktree add --detach ../open-seo-pub-<pr> FETCH_HEAD
cp .env.preview ../open-seo-pub-<pr>/
(cd ../open-seo-pub-<pr> && pnpm install --frozen-lockfile && pnpm exec vite build --mode preview)
rm -rf dist && cp -R ../open-seo-pub-<pr>/dist dist
git worktree remove --force ../open-seo-pub-<pr>
pnpm alchemy deploy --env-file .env.preview --stage pub-<pr> --yes
```

Verify the preview redirects to the Access login before sharing its URL.
Destroy the stage whenever the PR is done:

```sh
pnpm destroy:preview --stage pub-<pr> --yes
```

## Production

Production deploys through the same Alchemy stack, stage `hosted-prod`, which
names the existing production resources so `--adopt` imports them instead of
creating fresh ones. Its domains do not match the preview Access wildcard.
(The stage is `hosted-prod`, not `prod`, so a self-hoster's stage name can
never collide with the adoption path.)

```sh
pnpm deploy:postgres
```

The script runs the Postgres migrations (`db:migrate:pg`), builds, and then
`alchemy deploy --env-file .env.production --stage hosted-prod --adopt` —
`--adopt` and the stage are baked in so they cannot be forgotten, and alchemy
shows the plan for approval before applying. It uses the same
`pnpm alchemy login` credential as previews (make sure `query_cache:write`
was enabled for Hyperdrive).

### First-cutover checklist (one time)

The first Alchemy prod deploy adopts live resources. Before running it:

1. Append `--dry-run` to the alchemy command and read the plan — every prod
   resource (D1 `open-seo`, KV `every-super-seo`/`OAUTH_KV`, R2 `open-seo`,
   Hyperdrive `openseo`, Worker `open-seo`) should be adopted, none created.
2. Diff `.env.production` against the live worker's secrets
   (`GET /accounts/:id/workers/scripts/open-seo/secrets`): alchemy's deploy
   replaces the COMPLETE binding set, so any live secret missing from the env
   file deploys as `""` — most vars are optional-with-empty-default, so the
   deploy succeeds while silently disabling that integration.
3. Rehearse adoption on a scratch stage that mirrors prod's shape — deploy
   the scratch worker **with wrangler first** (including the `migrations`
   block) so it carries a wrangler-era migration tag and live DO namespaces
   like prod; a fresh alchemy stage skips the exact adoption path prod will
   take.
4. Compare `SELECT name FROM d1_migrations` on the prod D1 against
   `ls drizzle/*.sql` — alchemy applies any missing D1 migrations on the
   first deploy (wrangler-compatible ledger, verified), and the dormant prod
   D1 hasn't been migrated since the Postgres cutover.
5. Confirm the `HYPERDRIVE_ORIGIN_*` values in `.env.production` match the
   live Hyperdrive config — Cloudflare never returns origin credentials, so a
   mismatch would rewrite the origin.
6. Note: prod already serves on `open-seo.<subdomain>.workers.dev` (alchemy
   keeps it enabled; the workers.dev toggle never appears in `--dry-run`).
   The prod resources (worker, D1, R2, KV, Hyperdrive) carry alchemy's
   `RemovalPolicy.retain`, stamped into state on the first prod deploy: a
   destroy of stage `hosted-prod` forgets state but leaves the live resources
   untouched. (Workflow registrations are the exception — they're created
   inside the worker provider and aren't individually retainable — but
   re-registering a workflow is a lossless upsert.)

## Self-hosting on Cloudflare

Self-hosters deploy through wrangler (`wrangler.jsonc`) — see
docs/SELF_HOSTING_CLOUDFLARE.md. An alchemy-based self-host path (fresh
stage-suffixed resources plus a derived Cloudflare Access application) is a
planned fast-follow on top of this stack.
