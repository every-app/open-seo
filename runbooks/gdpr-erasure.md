# GDPR user erasure

`pnpm gdpr:erase-user` inventories and erases a hosted user's OpenSEO data. It
is Postgres-only and covers the application database, Cloudflare-bound state,
Google grants, Loops, PostHog, Autumn, and the Stripe customer linked through
Autumn.

The command defaults to a dry run. It refuses any organization with more than
one current member because deleting that workspace would erase another user's
data. Resolve ownership and shared-data retention manually before retrying.

## One-time deployment setup

Generate a long random secret and set the same value in the production Worker
and in the operator environment as `GDPR_ERASURE_SECRET`. The secret enables a
single HMAC-authenticated endpoint at `/api/internal/gdpr-erasure/storage`; the
endpoint returns 404 when the secret is unset.

Add `GDPR_ERASURE_SECRET` to `.env.production`, then deploy the Worker before
using the command. Keep the secret out of shell history and logs.

Verify the production R2 bucket has a lifecycle rule expiring the
`dataforseo-cache/` prefix (prod lifecycle rules are dashboard-managed). The
retention claims below depend on it.

## Operator environment

Put these values in a secure, untracked environment file or secret manager:

```dotenv
POSTGRES_DATABASE_URL=postgres://...
BETTER_AUTH_URL=https://app.openseo.so
GDPR_ERASURE_SECRET=...

LOOPS_API_KEY=...
AUTUMN_SECRET_KEY=...

POSTHOG_API_HOST=https://us.posthog.com
POSTHOG_PROJECT_ID=...
POSTHOG_PERSONAL_API_KEY=...
```

The script also reads `.env.local`/`.env` from the working directory, so run it
from a directory whose env files hold the intended values. The PostHog personal
key needs person read and write access. Use the EU PostHog API host if that is
where the project lives.

## Run

First inventory the exact target and affected row/resource counts:

```bash
pnpm gdpr:erase-user --email person@example.com
```

Confirm the identity and inventory, and that the dry run prints
`autumnEnvironment: "live"` — a sandbox Autumn key would silently skip the
production Stripe deletion. Then execute with the exact normalized email and
database host printed by the dry run:

```bash
pnpm gdpr:erase-user --email person@example.com \
  --execute --confirm person@example.com \
  --confirm-database-host us-east-3.pg.psdb.cloud
```

`--user-id <id>` can replace `--email` as the selector, but `--confirm` still
must be the email printed in the inventory.

The execution order is designed for safe retries:

1. Delete the Loops contact, queue PostHog person/event deletion, and delete
   Autumn plus its linked Stripe customer.
2. Call the Worker endpoint, which terminates active site-audit and rank-check
   Workflow instances, revokes Google grants, and erases chat/scratchpad
   Durable Objects, R2 audit payloads, KV progress entries, and MCP OAuth
   grants/tokens.
3. Delete the organizations and user in one Postgres transaction, relying on
   foreign-key cascades for project data, then verify the root rows are gone.

If a step fails, fix the reported credential or service error and run the same
command again. Vendor absence and already-finished Workflows are treated as
successful no-ops.

## Retention notes

The completion JSON is the erasure receipt; save it in the request case without
adding it back to product analytics. PostHog event deletion runs asynchronously.
Completed Workflow state and Workers logs expire under the Cloudflare account's
configured retention. Database backups and billing records that must be kept
for tax, fraud, or legal obligations should be isolated from production access
and allowed to expire under the documented retention schedule.

Prompt-response cache objects written after this erasure tooling was deployed
carry an organization tag and are deleted by the command. Older untagged cache
objects cannot be attributed to a user from their hashed key; they remain
inaccessible after account deletion and expire under the bucket's
`dataforseo-cache/` lifecycle rule (see the deployment setup above). Audit
scratchpad state for audits older than 30 days is skipped by the command
because those Durable Objects and progress keys already self-destructed via
their finalize path, 7-day alarm, or 30-minute TTL.
