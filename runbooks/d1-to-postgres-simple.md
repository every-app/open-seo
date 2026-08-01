# D1 → Postgres migration — simple runbook

_Last updated: 2026-06-29._

The happy path for moving a hosted instance from D1 to Postgres. For the full
detail — what the script converts, the low-downtime delta sync, cutover and
rollback — see
[d1-to-postgres-detailed.md](./d1-to-postgres-detailed.md).

> **Scope:** this runbook is for the OpenSEO production deployment —
> `pnpm deploy:postgres` is hardwired to alchemy stage `hosted-prod`, its domains, and
> `.env.production`. The alchemy self-host path (non-`prod` stages) has no
> Hyperdrive wiring, so Postgres is not currently available to self-hosters.

> Switching `DATABASE_PROVIDER` to `postgres` changes where the app reads and
> writes — it does **not** move existing data. This copies the data. D1 is never
> written to, so rollback is just flipping the provider back to `d1`.

## 1. Credentials → `.env.local`

The migration script auto-loads `.env.local` (no inline env vars needed):

```sh
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...          # needs D1 read
POSTGRES_DATABASE_URL=postgres://user:pass@host:5432/db
# CLOUDFLARE_D1_DATABASE_ID=...   # optional; otherwise read from wrangler.jsonc
```

## 2. Create the Postgres schema

Provision an empty Postgres, then apply the schema:

```sh
pnpm db:migrate:pg
```

## 3. Dry run (read-only)

Reports per-table row counts and writes nothing:

```sh
pnpm exec tsx scripts/migrate-d1-to-postgres.ts --dry-run
```

## 4. Migrate

```sh
pnpm exec tsx scripts/migrate-d1-to-postgres.ts
```

Confirm it ends with **"All row counts match."** (Re-runnable; it aborts if the
target already has data — pass `--allow-nonempty` to override.)

## 5. Catch-up sync (recommended)

Right before cutover, run the script again with `--update` to copy anything
written or changed since the bulk copy (new signups, fresh rank checks, etc.) —
cheap insurance that nothing was missed:

```sh
pnpm exec tsx scripts/migrate-d1-to-postgres.ts --update
```

Confirm **"All row counts match."** (A small mismatch from rows _deleted_ in D1
during the window is expected — see the detailed runbook.)

## 6. Cut over

Point the deployment at Postgres (`DATABASE_PROVIDER=postgres` plus a Hyperdrive
binding — the app only connects to Postgres through Hyperdrive) and deploy, then
smoke-test (load a project, save a keyword, check billing):

```sh
pnpm deploy:postgres
```

> **Optional — freeze writes** for a perfectly consistent snapshot: pause the
> rank-check cron / put the app in a read-only window from the dry run through
> cutover. Not required — the catch-up sync in step 5 covers writes made during a
> live copy.

## Rollback

Set `DATABASE_PROVIDER=d1` (remove the Postgres binding) and redeploy. D1 still
holds the original data, untouched.
