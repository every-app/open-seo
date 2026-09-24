# Running SEOShark on Postgres locally

SEOShark runs on **Cloudflare D1 (SQLite) by default**. Postgres is an opt-in
backend for installs that outgrow D1's storage ceiling. The application code is
written once against a provider-aware `db` layer (see `src/db/`), so the only
difference at runtime is the `DATABASE_PROVIDER` flag and a connection string.

This guide sets up a throwaway Postgres in Docker so you can develop and test the
Postgres path locally. **You do not need this for normal development** — D1 is the
default and the path most contributors should use.

## Prerequisites

- Docker Desktop (or Docker Engine)
- The normal local dev setup from [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md)

## 1. Start a Postgres container

Port `5433` is used on the host to avoid clashing with a system Postgres on the
default `5432`.

```sh
docker run --name openseo-postgres \
  -e POSTGRES_USER=openseo \
  -e POSTGRES_PASSWORD=openseo \
  -e POSTGRES_DB=openseo \
  -p 5433:5432 \
  -d postgres:16
```

Wait until it accepts connections:

```sh
docker exec openseo-postgres pg_isready -U openseo -d openseo
```

The connection string is:

```
postgres://openseo:openseo@localhost:5433/openseo
```

## 2. Apply the Postgres migrations

The Postgres schema is hand-written (it is the one structural artifact
`db:generate` does not regenerate) and migrations live in `drizzle-pg/`. Apply
them with `POSTGRES_DATABASE_URL` set — `drizzle-kit` reads it from the shell
environment:

```sh
POSTGRES_DATABASE_URL=postgres://openseo:openseo@localhost:5433/openseo \
  pnpm db:migrate:pg
```

## 3. Point the app at Postgres

The Cloudflare Vite runtime reads Worker vars from `.env.local`, so set the
provider flag there (not just in your shell):

```sh
# .env.local
DATABASE_PROVIDER=postgres
```

The simplest way to supply the connection string is `DATABASE_URL` in the same
file:

```sh
# .env.local
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://openseo:openseo@localhost:5433/openseo
```

Alternatively use the `HYPERDRIVE` binding, which mirrors how a Hyperdrive-
backed Cloudflare deploy connects: uncomment the `hyperdrive` block in
`wrangler.jsonc` and miniflare resolves the binding to its
`localConnectionString` (already pointing at the container from step 1). The
binding wins over `DATABASE_URL` when both are present. To point the binding
elsewhere without touching the config:

```sh
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://... pnpm dev
```

For a managed database use Supabase instead of the Docker container — see
[`DATABASE_SUPABASE.md`](./DATABASE_SUPABASE.md).

Then start the dev server as usual:

```sh
pnpm dev
```

To switch back to D1, remove that line (or set `DATABASE_PROVIDER=d1`) and
restart.

> `POSTGRES_DATABASE_URL` (step 2) is only read by Node-side tooling —
> `drizzle-kit` and `scripts/migrate-d1-to-postgres.ts` — and falls back to
> `DATABASE_URL` when unset. The app itself ignores it.

## 4. Verify

```sh
# Tables created by the migrations
docker exec openseo-postgres psql -U openseo -d openseo -c "\dt"

# Inspect rows the app writes (e.g. after creating a project / saving keywords)
docker exec openseo-postgres psql -U openseo -d openseo -c "select count(*) from projects;"
```

## Schema changes

When you change a table, update **both** dialects:

- SQLite: `src/db/*.schema.ts` (+ `pnpm db:generate:d1`)
- Postgres: `src/db/pg/*.schema.ts` (+ `pnpm db:generate:pg`)

`src/db/schema-parity.test.ts` fails CI if the two dialects drift (mismatched
tables, columns, nullability, primary keys, unique/partial indexes, or FK
`onDelete`). It compares the schema definitions, **not** the generated
migrations — so after editing the Postgres schema, always run `pnpm db:generate:pg`
and commit the new `drizzle-pg/` migration, or a Postgres deploy will be missing
the change even though the parity test is green.

## Teardown

```sh
docker rm -f openseo-postgres
```

This deletes the container and all its data. Re-run from step 1 for a clean slate.
