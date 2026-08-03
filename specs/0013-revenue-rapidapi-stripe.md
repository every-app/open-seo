# 0013 — Revenue page: RapidAPI subscriptions + Stripe

## Problem

OpenSEO doubles as a personal product dashboard. Two revenue sources matter
and neither is visible in the app:

- **RapidAPI marketplace subscriptions** to an API listing (e.g. Scholar
  Sidekick): how many subscribers, how many pay, and how new/churn is
  trending.
- **Stripe**: a recurring subscription product and a one-off purchase product
  (e.g. Agent Ready): active subscribers, MRR, churn, and one-off sales.

## Decision

A per-project **Revenue** page (`/p/$projectId/revenue`) with two independent
panels, mirroring the Vercel Web Analytics integration (specs/0010) exactly:

- Credentials are **instance-level env secrets**, never stored in the DB:
  - `STRIPE_SECRET_KEY` — a restricted key with read access to Products,
    Subscriptions, and Checkout Sessions.
  - `RAPIDAPI_KEY` + `RAPIDAPI_GRAPHQL_URL` — the GraphQL Platform API lives
    at a per-hub URL (`https://graphql-<hub>.p.rapidapi.com/`), so the
    endpoint is config, not a constant. Auth is `x-rapidapi-key` plus an
    `x-rapidapi-host` header derived from the URL.
- The DB stores only **identifier mappings** (`rapidapi_connections`,
  `stripe_connections`): which RapidAPI listing (`api_…` id, entered by hand
  and verified by running the subscriptions query — the Platform API has no
  usable "list my APIs" query) and which Stripe products (picked from
  `/v1/products`, either slot nullable) belong to a project.
- Data is **fetch-on-demand** — no snapshots, no cron. Metrics windows are
  the last 30 days vs the prior 30, computed in pure functions
  (`computeRapidapiMetrics`, `computeStripeSubscriptionMetrics`,
  `computeStripeOneOffMetrics`) so they're unit-testable.
- Two MCP tools: `get_rapidapi_subscriptions`, `get_stripe_revenue`.

## No PII, by construction

Subscriber identity is the opaque RapidAPI entity id only. The GraphQL query
**does not request** `entity.name` or `entity.email`, so names and emails
never enter the app, its logs, or MCP output. The Stripe client parses no
customer fields (no `customer`, `customer_details`) — only product ids,
amounts, statuses, and timestamps.

## RapidAPI metric semantics

- The documented subscriptions query guarantees `id/status/createdAt/
canceledAt/entity/api`; **plan info is not guaranteed** on Subscription
  nodes. The client tries a plan-aware query (`billingPlanVersion { name
price }`) first and falls back to the basic shape on a GraphQL error;
  "paying subscribers" is `null` when plan info is unavailable, and the UI
  says so instead of guessing.
- Active = not canceled (`canceledAt` null and status not matching
  /cancel/i). New/churned = `createdAt`/`canceledAt` inside the window.
- No pagination is documented for the query; the panel reads the returned
  nodes and reports `totalCount` from the API.

## Stripe metric semantics

- Subscriptions: `/v1/subscriptions?status=all` paginated (100 × 5 pages
  max), scoped to the mapped product via `items[].price.product` because the
  list endpoint has no product filter. Active = `active | trialing |
past_due`. Churned = `canceled_at` in window. MRR = active items'
  `unit_amount × quantity` normalized per billing interval (day/week/month/
  year) to a monthly figure, in minor currency units.
- One-off: `/v1/checkout/sessions?created[gte]=60d&expand[]=data.line_items`,
  filtered to `mode=payment` + `payment_status=paid`, matched on line-item
  product. Revenue sums the session `amount_total`, so a multi-product cart
  counts in full toward the matched product — acceptable for a
  single-product store, noted in the code.

## Failure surfacing

Same shape as Vercel: missing secrets → `setup_required` card with the exact
`wrangler secret put` commands; 401/403 (`isExpected*Failure`) and
not-connected collapse to `{ connected: false }` in the page server function
so the page renders the connection card instead of an error boundary; MCP
tools return `{ ok: false, reason: "not_connected" | "api_error",
connectUrl }`.
