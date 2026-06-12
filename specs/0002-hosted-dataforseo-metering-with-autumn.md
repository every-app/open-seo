# Hosted DataForSEO metering with Autumn

## Status

Accepted

## Context

In hosted mode, OpenSEO uses platform-managed DataForSEO credentials and bills each organization for actual provider usage.

The low-level DataForSEO helpers can make live requests directly. If feature code imports them freely, it is easy to skip billing checks, forget usage tracking, or meter against estimated cost instead of the cost DataForSEO actually returned.

Autumn's billing model fits this flow: check access before the call, then track usage after the call succeeds.

## Decision

Hosted DataForSEO access must go through `createDataforseoClient`.

We model hosted SEO data billing in Autumn as a credit system:

- `base-plan` grants recurring `usage_credits`
- `credit-top-up` sells more `usage_credits`
- `seo_data_usage` is the metered feature DataForSEO calls consume
- `1000` credits equals `$1`

In hosted mode, the client:

- accepts `BillingCustomerContext`, not an Autumn customer ID
- resolves the Autumn customer from `organizationId`
- checks `seo_data_usage` before calling DataForSEO, using a small minimum balance guardrail
- executes a raw `fetch*Raw` helper that returns parsed data plus provider billing metadata
- tracks the actual reported DataForSEO cost in Autumn after the call succeeds

In non-hosted mode, the client skips Autumn and executes the DataForSEO call directly.

Raw `fetch*Raw` helpers remain low-level transport and parsing functions. They are not the application entry point for hosted features.

## Rationale

This makes the metered path the easiest path. Feature code asks for DataForSEO data once and gets billing enforcement by default.

It also keeps billing aligned with provider-reported cost. We do not know the exact charge until DataForSEO responds, so the client does a preflight balance check and records the exact usage event afterwards.

## Consequences

- New DataForSEO capabilities should be added to `src/server/lib/dataforseoClient.ts`, not called from feature code via raw helpers.
- Hosted feature services must pass billing customer context into the client.
- Subscription eligibility remains a separate concern handled by auth middleware; the client is responsible for usage metering.
- Direct raw DataForSEO imports in hosted application code should be treated as billing bypasses.
