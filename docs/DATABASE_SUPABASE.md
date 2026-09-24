# Running on Supabase Postgres

The app ships with SQLite (Cloudflare D1 locally and in the Docker image) as
the zero-config default. For a product deployment use Postgres. Supabase is
the supported managed Postgres: the app only needs a connection string, and
Supabase's built-in pooler handles the connection churn of a serverless
runtime.

Only the **database** comes from Supabase. Authentication stays with Better
Auth (its tables live in the same Postgres), so nothing about Supabase Auth,
Row Level Security or the Supabase client libraries is involved.

## 1. Create the project and copy the connection strings

1. Create a project at [supabase.com](https://supabase.com). Save the database
   password.
2. Open **Project Settings → Database → Connection string** (or the
   **Connect** button on the dashboard). You need two URLs:

| Purpose                      | Which URL to copy                                                  | Env var                 |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------- |
| App at runtime               | **Transaction pooler**, port `6543`                                | `DATABASE_URL`          |
| Migrations from your machine | **Direct connection** (port `5432`) or **Session pooler** (`5432`) | `POSTGRES_DATABASE_URL` |

The transaction pooler cannot run migrations (it does not support the session
state `drizzle-kit` relies on), and the direct connection is IPv6-only unless
you buy the IPv4 add-on. If migrations fail to connect with the direct URL,
use the session pooler URL instead.

## 2. Configure the app

Add to `.env.local` (local dev), `.env` (Docker) or `.env.production`
(Cloudflare deploy):

```sh
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
POSTGRES_DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

`DATABASE_URL` is read by the app when no Hyperdrive binding is present. The
Postgres client automatically disables prepared statements on that path, which
the transaction pooler requires.

## 3. Apply the migrations

```sh
pnpm db:migrate:pg
```

The command reads `POSTGRES_DATABASE_URL` (falling back to `DATABASE_URL`)
from the shell or `.env.local`. Run it after every pull that adds files under
`drizzle-pg/`. Migrations never run from the deployed app.

## 4. Run

- **Local dev:** `pnpm dev` picks up `.env.local`.
- **Docker:** set the three variables in `.env`; the container entrypoint runs
  the Postgres migrations at start when `DATABASE_PROVIDER=postgres`.
- **Cloudflare deploy:** see the two options below.

## Cloudflare deploys: Hyperdrive or direct

The Alchemy production stage (`pnpm deploy:postgres`) supports both:

- **Hyperdrive in front of Supabase (recommended).** Set the
  `HYPERDRIVE_ORIGIN_*` values in `.env.production` to the Supabase _session
  pooler_ host, port `5432`, user `postgres.<project-ref>` and your password.
  Alchemy creates the Hyperdrive config and binds it to the Worker. Hyperdrive
  keeps warm connections near the Worker, which removes the per-request
  connect cost.
- **Direct.** Leave the `HYPERDRIVE_ORIGIN_*` values unset and set
  `DATABASE_URL` to the transaction pooler URL. Simpler, slightly slower per
  request.

When both are present the Hyperdrive binding wins.

## Local Supabase (optional)

The Supabase CLI runs the same stack locally:

```sh
npx supabase init   # once, creates supabase/config.toml
npx supabase start  # prints a local DB URL on port 54322
```

Point both `DATABASE_URL` and `POSTGRES_DATABASE_URL` at that URL. The local
stack has no transaction pooler, so a single URL works for both.

## Schema changes

Edit both dialects (`src/db/*.schema.ts` and `src/db/pg/*.schema.ts`), then
run `pnpm db:generate:pg` and commit the new file under `drizzle-pg/`. The
parity test in `src/db/schema-parity.test.ts` fails CI if the two dialects
drift. See [`LOCAL_POSTGRES.md`](./LOCAL_POSTGRES.md) for the Docker-Postgres
development loop.
