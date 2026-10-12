# Hosted DataForSEO metering with Autumn

## Status

Accepted. Revised when the pre-call balance check became an atomic credit hold, and again when live rank check batches began to share holds.

## Context

In hosted mode, OpenSEO uses platform-managed DataForSEO credentials and bills each organization for actual provider usage.

The low-level DataForSEO helpers can make live requests directly. If feature code imports them freely, it is easy to skip billing checks, forget usage tracking, or meter against estimated cost instead of the cost DataForSEO actually returned.

The first version checked that the balance was above zero before the call and tracked the real cost after it. That check is not atomic: many concurrent requests all read the same positive balance and all pass, so an organization could spend far past its credits before any deduction landed.

## Decision

Ordinary hosted DataForSEO calls go through `createDataforseoClient`. Admitted website/setup research owns its metering as described below.

We model hosted SEO data billing in Autumn as a credit system:

- `base-plan` grants recurring `usage_credits`
- `credit-top-up` sells `topup_credits`, spent after `usage_credits`
- `1000` credits equals `$1`

In hosted mode, an ordinary metered call:

1. Estimates an upper bound for its cost from the request input. Each client entry requires an estimator from `pricing.ts`, so an entry without a price does not compile.
2. Holds that estimate on `usage_credits`, or on `topup_credits` when the monthly balance cannot cover it, with Autumn's balance lock. Autumn grants or refuses the hold atomically. When neither balance covers it, the call fails with `INSUFFICIENT_CREDITS` and DataForSEO is never called.
3. Calls DataForSEO.
4. Confirms the hold at the cost DataForSEO reported, or releases it when the call was not billed. The call and the settlement are registered with the request, so a client that disconnects mid-call cannot skip the deduction.

Estimate and deduction use one formula (`creditsForProviderUsd`), so they cannot drift apart. A hold that is never settled expires on its own and returns the credits.

A live rank check batch shares its holds instead of taking one per call. It takes at most one hold on each balance, and each call goes where a hold of its own would go: in order, on `usage_credits` while they cover it, else on `topup_credits`, else that call alone is refused. Each hold is settled once, with only its own calls. Every call is still converted to credits on its own, so a batch costs exactly what the same calls would cost one at a time.

Scheduled AI visibility checks post each batch of prompts through the client like queued rank checks; collecting the answers is free. A manual AI visibility check collects live answers instead, and each batch of live calls shares one hold and one settle, like a manual rank check. Admitted website/setup research instead checks for a positive balance once, finishes all research without another credit gate, and settles actual usage through `billResearchSpend`, allowing a negative balance; it owns metering for its raw provider calls.

In non-hosted mode, the client skips Autumn and executes the DataForSEO call directly.

Raw fetch helpers remain low-level transport and parsing functions. They are not the application entry point for hosted features.

## Rationale

This makes the metered path the easiest path. Feature code asks for DataForSEO data once and gets billing enforcement by default.

Concurrent calls each take their own hold and do not wait on each other, so normal parallel work is unchanged. The sum of in-flight holds can never exceed the balance, so an organization can spend at most its balance plus any amount by which an estimate undershoots the real cost. An undershoot is reported so the price table can be corrected.

A hold costs two Autumn round trips (hold, finalize), which is no more than the balance reads and usage tracking it replaces. A live rank check batch shares its holds because it starts many calls for one organization at once: a hold and a finalize for each call sent dozens of concurrent Autumn requests for one customer, and a finalize that times out loses its charge.

## Alternatives considered

- **Keep the balance check and add a per-organization rate limit.** Still check-then-act, so a burst inside the limit still overdraws. Cloudflare's rate limiter is also per location and best effort. It throttles a busy paying organization before it stops an abusive one.
- **Serialize each organization's calls in a Durable Object.** Bounds overdraft to one call, but it adds a new stateful service to the billing path and slows legitimate parallel work such as keyword research and rank checks.
- **Reservation ledger in the app database.** Works without Autumn's lock feature, but it adds a table, a sweeper for abandoned rows and several writes per call, and it duplicates balances that already live in Autumn.
- **Hold a fixed amount per call instead of an estimate.** Removes the price table, but a flat hold is either too small to bound expensive calls such as batched rank checks, or too large for an organization with few credits left to make cheap calls.

## Consequences

- New ordinary DataForSEO capabilities should use `createDataforseoClient` with a price estimate; admitted research uses the metered entry point above.
- Hosted feature services must pass billing customer context into the client.
- Subscription eligibility remains a separate concern handled by auth middleware; the client is responsible for usage metering.
- Direct raw DataForSEO imports outside the client and the research entry point above should be treated as billing bypasses.
- A call is refused when the balance is below its estimate, not its real cost, so the last few credits of a balance can go unused until the next grant or top-up.
- Other spend with a cost known up front (for example JavaScript rendering in site audits) can use the same hold and settle functions. Agent LLM spend is still tracked after the fact because its token cost is not known before the call.
