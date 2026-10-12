# D1 → Postgres migration — detailed runbook

_Last updated: 2026-06-29._

When a hosted instance outgrows D1's storage ceiling, you switch it to the
Postgres backend (`DATABASE_PROVIDER=postgres`). The provider switch changes
where the app reads and writes — it does **not** move existing data. This runbook
copies the data into a freshly-migrated Postgres database using
`scripts/migrate-d1-to-postgres.ts`. For the condensed happy path see
[d1-to-postgres-simple.md](./d1-to-postgres-simple.md).

> **Scope:** this runbook is for the OpenSEO production deployment —
> `pnpm deploy:postgres` is hardwired to alchemy stage `hosted-prod`, its domains, and
> `.env.production`. The alchemy self-host path (non-`prod` stages) has no
> Hyperdrive wiring, so Postgres is not currently available to self-hosters.

The script reads **each table directly from D1 over the Cloudflare REST API** and
writes to Postgres — there is no SQL dump to download or reimport. (An earlier
dump-based approach was dropped after a `wrangler d1 export` download silently
truncated yet reported success; reading tables over the API avoids that whole
class of failure and reads live, complete data.)

D1 is left untouched throughout, so **rollback is just flipping the provider flag
back to `d1`** until you've confirmed the Postgres cutover is healthy.

> **Schema drift:** the script was authored 2026-06-29 and reflects the schema as
> of that date (it enumerates every table via Drizzle). If the schema changed
> after this was merged — a new table, a renamed timestamp column, a new table
> without a primary key — re-read the script (especially `deltaPredicate` and
> `conflictArbiterNames`) before relying on it.

## What the script converts

Some columns are dialect-native, so a raw copy doesn't work. Each raw D1 value is
run through the SQLite column's Drizzle codec and written through the Postgres
column, so the conversions happen with the same logic the app itself uses:

- **better-auth tables** (`user`, `session`, `account`, …): SQLite stores
  timestamps as integer epoch-ms and booleans as integer `0/1`; Postgres uses
  `timestamptz` and real `boolean`.
- **App tables** (`projects`, `saved_keywords`, `billing_customer_status`, …):
  timestamps are text in both, but D1's `current_timestamp` default
  (`YYYY-MM-DD HH:MM:SS`) is rewritten to the ISO-8601 form the Postgres code
  expects (`YYYY-MM-DDTHH:MM:SS.000Z`). Values the app already wrote in ISO are
  left untouched.

Tables are copied in foreign-key-safe order, and inserts use
`onConflictDoNothing`, so the script is safe to re-run.

After the copy, the script advances the Postgres serial sequences
(`keyword_metrics.id`, `rank_snapshots.id`) to the max migrated id. Those ids are
auto-incremented in SQLite and copied verbatim, so without this step new inserts
after cutover would collide with migrated rows.

## Prerequisites

- The provider-aware build is deployed (this branch / its parent).
- Credentials in `.env.local` (the migration script auto-loads it; so does
  `db:migrate:pg`):
  ```sh
  CLOUDFLARE_ACCOUNT_ID=...
  CLOUDFLARE_API_TOKEN=...          # needs D1 read
  POSTGRES_DATABASE_URL=postgres://user:pass@host:5432/db
  # CLOUDFLARE_D1_DATABASE_ID=...   # optional; otherwise read from wrangler.jsonc
  ```
  Get your account id from `wrangler whoami`.
- A Postgres database provisioned and **freshly migrated, empty**:
  ```sh
  pnpm db:migrate:pg
  ```

## Steps

1. **Dry run** to review per-table row counts before writing anything. This only
   reads D1 (no Postgres connection is opened):

   ```sh
   pnpm exec tsx scripts/migrate-d1-to-postgres.ts --dry-run
   ```

2. **Migrate** into the empty Postgres. The script aborts if the target already
   has rows (pass `--allow-nonempty` to override; it stays idempotent):

   ```sh
   pnpm exec tsx scripts/migrate-d1-to-postgres.ts
   ```

   Confirm it ends with **"All row counts match."**

3. **Cut over.** Point the deployment at Postgres (`DATABASE_PROVIDER=postgres`
   plus a Hyperdrive binding — the app only connects to Postgres through
   Hyperdrive) and deploy:

   ```sh
   pnpm deploy:postgres
   ```

4. **Verify.** Smoke-test the live app — load a project, save a keyword, check
   billing.

> **Optional: freeze writes for a consistent snapshot.** The copy reads each
> table as it goes, so writes that land mid-run can be missed. For a perfectly
> consistent one-shot copy, pause the scheduled rank-check cron and put the
> instance into a brief read-only window during steps 1–3, then re-enable after.
> This is **not required** — the low-downtime path below avoids it.

## Low-downtime cutover (delta catch-up)

The big tables (`keyword_metrics`, `audit_pages`, …) dominate the copy time, so a
full freeze can mean several minutes of downtime. To avoid it, do the bulk copy
**live**, then a short delta catch-up just before cutover:

1. **Bulk copy, live** — run the full migration (step 2) while the app is still
   serving. It's allowed to miss writes that land mid-copy; the delta pass below
   reconciles them.
2. **Delta sync** — copy only what changed since the bulk copy and **upsert** it:

   ```sh
   pnpm exec tsx scripts/migrate-d1-to-postgres.ts --update --since-hours 12
   ```

   Set `--since-hours` to comfortably cover the gap between the bulk copy and now.
   Genuinely large, append-mostly tables (`keyword_metrics`, `rank_snapshots`,
   `audit_pages`, `audit_lighthouse_results`) are filtered to their recent rows;
   everything else — including mutable tables that take in-place updates (audits,
   rank-check runs, tracked keywords) and the small config/entity tables — is
   fully re-upserted, so new signups and updates to existing rows (refreshed
   tokens, archived projects, advanced schedules, completed runs) are all picked
   up. Confirm **"All row counts match."**

3. **Cut over** (step 3 above) and verify.

   For the smallest possible window you can briefly freeze writes between the
   delta sync and cutover, but it's usually unnecessary.

`--update` is safe to re-run, skips the empty-target preflight, and re-advances
the serial sequences. **Deletes are not synced** — a row deleted in D1 during the
window stays in Postgres (it surfaces as a count mismatch in the verify step,
e.g. a few expired sessions/verification rows). If deletes during the window must
be reflected, do the full copy under a write-freeze instead.

## Rollback

If anything looks wrong after cutover, set `DATABASE_PROVIDER=d1` (remove the
Postgres binding) and redeploy. D1 still holds the original data, untouched.

## Notes

- The migration reads D1 in pages (`--page-size`, default 5000) and writes in
  FK-safe order; it holds at most one page in memory at a time.
- Local-only practice run: see
  [`../docs/LOCAL_POSTGRES.md`](../docs/LOCAL_POSTGRES.md) to rehearse against a
  Docker Postgres first.
- Flags: `--dry-run`, `--allow-nonempty`, `--page-size N`, `--update`,
  `--since-hours N`. Run with no flags for a full one-time copy.
