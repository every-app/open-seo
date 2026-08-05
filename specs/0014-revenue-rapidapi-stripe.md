# 0014 — Revenue page: Stripe + RapidAPI snapshots

## Problem

OpenSEO doubles as a personal product dashboard. Two revenue sources matter
and neither is visible in the app:

- **Stripe**: a recurring subscription product and a one-off purchase product
  (e.g. Agent Ready): active subscribers, MRR, churn, and one-off sales.
- **RapidAPI marketplace subscriptions** to an API listing (e.g. Scholar
  Sidekick): how many subscribers, how many pay, and the trend.

## Decision

A per-project **Revenue** page (`/p/$projectId/revenue`) with two independent
panels:

- **Stripe** mirrors the Vercel Web Analytics integration (specs/0010):
  the credential is an **instance-level env secret**, never stored in the DB.
  `STRIPE_SECRET_KEY` is a restricted key with read access to Products,
  Subscriptions, Checkout Sessions, and Refunds (refund/net tiles degrade
  gracefully without the Refunds grant). An organization-level key works
  across projects on different Stripe accounts: each connection stores its
  target account (`acct_…`, an identifier, not a secret) and the client
  sends it as `Stripe-Context`. Requests always pin `Stripe-Version` —
  newer accounts have no default version and reject versionless requests
  (both verified live 2026-08-03). The DB stores only the identifier
  mapping (`stripe_connections`): account + products picked from
  `/v1/products` (archived products included — a retired one-off product's
  history still matters), either product slot nullable.
- **RapidAPI is manual snapshots** (`rapidapi_snapshots`): date + active
  subscribers + optional paying count, logged by hand from Studio →
  Analytics, one row per project per day (re-logging a day replaces it).
  The panel shows the latest numbers with the change since the previous
  snapshot, a log form, and the history.
- Stripe data is **fetch-on-demand** — no snapshots, no cron. Metric
  windows are the last 30 days vs the prior 30, computed in pure functions
  (`computeStripeSubscriptionMetrics`, `computeStripeOneOffMetrics`,
  `computeStripeRefundMetrics`, `buildSnapshotReport`) so they're
  unit-testable.
- Two MCP tools: `get_stripe_revenue`, `get_rapidapi_snapshots`.

## Why RapidAPI is manual

A live integration was built first against the GraphQL Platform API and
verified end-to-end — then RapidAPI support confirmed (2026-08-04) that
**no platform APIs exist for public-marketplace Hub data**: the
`subscriptions` query is Enterprise Hub / Environment Admin only, on the
public marketplace it returns only the _calling account's own_
subscriptions (silently ignoring an unknown `where.apiId`), and the
accidentally-public test endpoint we used was retired to private.
Subscriber data for public listings exists solely in the Studio Analytics
dashboards. Manual snapshots are the honest fallback; the live client was
removed (see git history of `src/server/lib/rapidapiClient.ts`).

## No PII, by construction

Snapshots are counts only. The Stripe client parses no customer fields (no
`customer`, `customer_details`) — only product ids, amounts, statuses, and
timestamps.

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
- Refunds: `/v1/refunds?created[gte]=60d` (succeeded only), attributed to
  the product via the refund's PaymentIntent → the session's
  `payment_intent`. A refund whose purchase predates the sessions window is
  resolved with a per-refund session lookup (capped at 20). Refund and net
  tiles report the refund's _created_ window — a July refund of a June
  purchase counts as a July refund.

## Failure surfacing

Stripe, same shape as Vercel: a missing secret → `setup_required` card with
the exact `wrangler secret put` command; 401/403
(`isExpectedStripeFailure`) and not-connected collapse to
`{ connected: false }` in the page server function so the page renders the
connection card instead of an error boundary; the MCP tool returns
`{ ok: false, reason: "not_connected" | "api_error", connectUrl }`. The
RapidAPI snapshot panel has no external dependency to fail — an empty
history just prompts for the first log.
