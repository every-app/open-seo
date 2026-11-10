# Self-serve plan upgrades

## Status

Accepted.

## Context

Hosted organizations subscribe to a monthly plan that grants usage credits each month (see [hosted metering](0002-hosted-dataforseo-metering-with-autumn.md)). Checkout sells a plan to an organization on the free plan, but a paying organization had no way to move to a bigger plan in the app: the Billing page opened the Stripe portal, and a pricing-page plan link told them to email support.

A plan sells credits, not time, so the usual mid-cycle change does not fit. Autumn's default upgrade charges the price difference for the rest of the cycle and grants the new plan's whole monthly allowance at once. An upgrade the day before renewal then buys a month of the bigger plan's credits for a day's price. A downgrade has the mirror problem: spend the bigger plan's credits, then move down and pay the smaller plan's price.

## Decision

A billing manager on a monthly plan can upgrade to a pricier tier (Base to Pro or Agency, Pro or YC to Agency) from the plan picker. Billing's "Change plan" button and pricing-page plan links open it. Moving to a cheaper plan, moving to a yearly plan, changing a yearly plan and changing a plan granted by hand stay with support. The picker marks the current plan and offers "Email us to switch" for the rest. Checkout sells the yearly plans only to an organization without a plan, so under the picker's Yearly switch each plan opens a dialog that points to support.

An upgrade is prorated by credits instead of days:

- It starts a new monthly cycle today, at the new plan's full price, charged to the saved card.
- There is no refund for the old plan's unused days.
- The credits left from the old plan carry over, and last until the new cycle's first refill.
- Top-up credits are not touched.

The confirm step shows Autumn's preview of the charge, the credits the organization will have, and the renewal date and price. The upgrade is an Autumn attach with the billing cycle anchored to now, proration turned off and the monthly credit balance carried over. Autumn keeps carried-over credits until the old plan's refill date, so the app moves them to the new refill date right after the charge. The charge has landed by then, so if that last step fails it is reported and the upgrade still succeeds; the credits then end at the old date.

The server decides whether an organization can upgrade and builds every Autumn request from fixed plan IDs. An organization whose last payment failed updates its card first. Checkout refuses a tier plan to an organization that already pays, so Autumn's default proration cannot be reached that way; the YC deal is still sold to subscribers through checkout.

## Rationale

Every dollar charged buys credits at the new plan's rate, and nothing already paid for is lost, so the timing of an upgrade gains nothing. Restarting the cycle also gives the customer one date to read: everything they have lasts until the renewal the confirm step shows.

Carrying credits over instead of refunding unused days is the credit-based version of proration. A refund for unused days would also pay back a cycle whose credits were already spent.

Downgrades stay manual because their abuse case has no clean credit-based answer. Few customers need them, and support can settle each one.

## Alternatives considered

- **Autumn's default proration.** Charges the rest of the month's difference and grants the full allowance. Rejected: a late-cycle upgrade buys a month of credits for a few days' price.
- **Charge the difference, keep the renewal date.** Charge the full-month price difference now and subtract the credits already used from the new allowance. It is fair, but an upgrade late in the cycle buys credits that reset days later, and our Autumn SDK does not offer that proration mode.
- **Refund unused days and drop the old credits.** The common SaaS model. It pays back days whose credits may already be spent, and loses credits the customer paid for.
- **Leave carried-over credits on the old refill date.** One Autumn call fewer, but the confirm step would need two dates, and credits could lapse days after an upgrade.

## Consequences

- The renewal date and the monthly refill move to the day of the upgrade.
- The Billing page reads the plan's monthly credits from that plan's own grant, since the balance also holds carried-over credits until the refill.
- When the bank asks the customer to confirm the charge, the app sends them to Autumn's payment page; the carried-over credits then keep the old refill date.
- Lifecycle emails stay silent on a change between paid plans; referral sales count the upgrade's invoice like any other.
