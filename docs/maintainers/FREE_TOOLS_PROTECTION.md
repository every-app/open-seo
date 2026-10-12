# Free tool abuse protection

The website's public API routes protect paid provider calls independently of
the user interface. Deployed builds require a real Turnstile secret, the rate
limiter binding, and Cloudflare's client IP header. Missing or failed protection
returns 503; it does not allow the lookup. Local Vite development may omit the
Turnstile secret, but still uses the local rate limiter and budget object.

- JSON bodies are limited to 16 KiB, including streamed bodies. Tool schemas
  constrain domain counts, input lengths, countries and result limits.
- Cross-origin browser submissions are rejected. Direct clients still need a
  valid Turnstile token; Origin is not treated as authentication.
- The shared limiter allows five submissions per IP per minute across all
  tools, before calling Turnstile. Cloudflare's edge limiter is approximate.
- Siteverify must confirm success, the request hostname and `free_tool` action.
  Missing, invalid, expired or replayed tokens cannot reach cache/provider code.
  Verification has a five-second timeout and fails closed.
- Verified cache hits can be served without spending budget. Paid results are
  cached for 24 hours per cache key/Cloudflare location; failures use short TTLs.
- Before any paid request, a SQLite Durable Object atomically reserves the
  full run's call count and conservative estimated cost. There is one object per
  UTC day. Concurrent requests cannot oversubscribe its configured allowance.
- The budget also enforces 40 upstream calls per visitor/day, per-tool ceilings,
  and 6,000 upstream calls/day across tools. Failed requests are not refunded.
  Visitor identifiers are date-scoped IP hashes, not raw addresses; hashes are
  not anonymous. Old objects delete their stored counters after three days.

## Budget and deployment

`FREE_TOOLS_DAILY_BUDGET_USD` in `web/wrangler.jsonc` is $100 per UTC day for
production and $10 for preview. Each environment has a separate Durable Object
namespace and allowance. A zero allowance disables uncached paid lookups.
Reservation prices live in `web/src/lib/free-tools/spend.ts`: 2.5 cents per
backlinks call, 1.5 cents per Labs call, including the keyword finder and generator (one call each, up to 20 rows). These
are conservative ceilings for the current endpoints and result limits, not
invoice reconciliation. Revisit them whenever provider prices or requests change.

Deploy the full website bundle with its Durable Object migration and bindings.
`web/src/worker.ts` exports both the TanStack handler and the budget class. Use
the existing deployment scripts, which reject missing or test site keys, and
configure the matching `TURNSTILE_SECRET_KEY` for each deployed environment.
The new action check requires client and server changes to deploy together.

Turnstile and per-IP limits do not eliminate human-assisted abuse or rotating
proxies. The atomic shared budget limits their paid lookups. A separately
verified provider-account spending limit remains useful as a billing backstop;
this change does not configure or verify one. No production changes are made by
running local tests.

## Limit logs

Worker logging is enabled in `web/wrangler.jsonc`. Search the website Worker's
logs for `free_tool_limit_reached` to find blocked budget reservations.
`limit: daily_spend` identifies the shared dollar allowance; the entry includes
`usedEstimatedUsd`, `requestedEstimatedUsd`, `limitUsd`, tool, and UTC day.
`daily_calls`, `tool_calls`, and `visitor_calls` identify the separate call caps
and include the used, requested, and allowed call counts. Entries omit visitor
identifiers, IPs, domains, and keywords. Limits are logged when a request is
blocked, not when usage merely approaches the allowance.

These logs do not send automatic notifications. No email, Slack, or spending
threshold alert is configured by this feature.

## Local website setup

For the website's DataForSEO tools, set `DATAFORSEO_API_KEY` in the ignored
`web/.dev.vars` file and restart the website dev server. Use the base64 credential
format in [the API key guide](../docs/DATAFORSEO_API_KEY.md). The website does not
inherit the root `.env.local`; without its own runtime key, paid tools return
“Service temporarily unavailable.” Domain Age Checker uses public RDAP data,
and SERP Simulator runs in the browser without a key. Real provider submissions
use the configured account's API credits.

## Validation

From the repository root:

```sh
pnpm --dir web run test:protection
pnpm --dir web run types:check
pnpm --dir web run build
```

The tests use mocked Siteverify responses for rejection paths and real local
workerd/SQLite storage for concurrency, whole-run limits, rollback and persistence.
They make no paid provider calls. A deployed verification pass must still confirm
valid submissions succeed and missing, invalid, expired and reused tokens fail.
