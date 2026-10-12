# Billing lifecycle emails

## Status

Accepted. Builds on the Autumn billing webhook from `specs/0002-hosted-dataforseo-metering-with-autumn.md` and the owner-only billing role from `specs/0011-multi-user-organizations.md`.

## What it does

Three moments in a paid subscription get a personal email from the founder, sent through Loops and addressed to the organization owner only:

- **Subscribed.** A thank-you right after the first paid plan activates, and a one-week check-in that only goes out if the subscription is still in good standing.
- **Payment failed.** When a renewal charge fails and the subscription goes past due, an email explaining what happened and linking to a page in the app that offers one fix: update the card in the billing portal, where the invoice can also be paid.
- **Cancelled.** When the owner cancels, an email asking why and offering a call.

Owners are the only recipients because only they can act on billing, and a founder note to three teammates reads as spam. Upgrades between paid plans send nothing. Involuntary churn, where a past-due subscription finally expires, sends nothing either: that person already received the payment email and did not choose to leave.

## How it works

**Signal.** Autumn already posts `billing.updated` to the app on every plan change, and the handler already re-reads the whole customer and stores it. Lifecycle events are derived by comparing the customer as it was at the last webhook with the customer as it is now. Autumn's webhook payload does describe the change, but the stored snapshot is what the app already trusts, it survives out-of-order delivery, and a retried webhook finds no difference and sends nothing. Nothing new is persisted: the two fields the comparison needs, past-due and cancelled-at, come out of the stored customer document.

| Before                | After                            | Event                   |
| --------------------- | -------------------------------- | ----------------------- |
| Not on a priced plan  | Active on a priced plan          | `subscription_started`  |
| Not past due          | Past due                         | `payment_failed`        |
| Active, not cancelled | Cancelled at period end, or gone | `subscription_canceled` |

"Priced" means the base plan or the YC plan. A plan can grant the paid entitlement without charging, and those customers are not thanked for subscribing.

A customer with no stored snapshot produces no events. Every new organization gets a snapshot on its first webhook, because the free plan auto-enables at signup before anyone can pay, so a missing snapshot means a customer from before the table existed, whose next renewal or top-up must not read as a new subscription.

**Delivery.** Each event is one Loops event, sent to every member whose role can manage billing, carrying the plan id. The same sync refreshes every member's billing properties, including a new `billingState` property with values `none`, `active`, `past_due`, `canceling`, `scheduled` or `expired`, so Loops audience filters can ask whether someone is still in good standing. Loops accepts an idempotency key per event send; the key is built from the event name, the organization, the recipient and the timestamp of the previous snapshot, so a retried webhook cannot send twice even if the snapshot write failed after the send succeeded. A conflict on that key is treated as success.

Event sends happen before the snapshot is written. If Loops is unreachable the webhook fails, Autumn retries, and the comparison produces the same events with the same keys.

**Workflows.** Loops owns timing and copy. Each event triggers one workflow. The subscribed workflow sends the thank-you, waits seven days, then passes the contact through an audience filter requiring `billingState` to be `active` before the check-in. The filter applies to all following nodes, so a cancellation or failed payment during the week removes the contact before the second email. The other two workflows are a trigger and one email. Workflows are created as drafts through the Loops API and only start when a maintainer presses Start in the dashboard.

**Fix-payment page** at `/billing/fix-payment`. Shows whether the subscription is past due and offers one action: open the Stripe billing portal. The portal is the only action because it does two things the hosted invoice page cannot do together: a card added there becomes the default for future renewals, and the open invoice can be paid on the same screen. Paying the hosted invoice with a new card would not save that card when a default already exists, so the next renewal would fail again. The portal returns to the same page with a flag, and the page polls the customer for half a minute and shows a success screen once the subscription is no longer past due, or explains that Stripe's retry can take a few minutes and offers the portal again. Members who cannot manage billing are told to ask the owner. A visitor with nothing outstanding sees that their billing is up to date. The card decline reason is not shown because Autumn does not expose it.

## Alternatives considered

- **Triggering Loops workflows on contact property changes** instead of events. Fires once per member, cannot express "payment failed" without inventing a property for it, and cannot carry the plan or reason into the email.
- **Deriving events from the webhook payload's `plan_changes`** rather than from the stored snapshot. Needs a dedup store to survive retries, and an upgrade arrives as an activation and an expiry that must be paired by hand. The snapshot diff gets both for free.
- **Listening to Stripe webhooks directly** for `invoice.payment_failed` and `customer.subscription.deleted`. A second webhook route, a second signature scheme, and a second customer id mapping, for information Autumn already forwards.
- **Delaying the check-in with a Cloudflare Workflow or cron** instead of a Loops timer. The app would then own send timing for a marketing email and have to re-check billing state itself before sending. Loops already does both.
- **Embedding a billing portal link in the payment email.** Portal sessions expire in minutes. The app page mints one on click.
- **A "Pay invoice" button that opens Stripe's hosted invoice page.** Immediate, but a new card entered there is not saved as the default when one already exists, so an expired card fails again next month. The portal fixes both.
- **Different copy for the YC plan.** Same emails; a Slack alert on YC activations covers the warmer outreach.
- **Emailing every member.** Only the owner can fix billing or cancel.

## Not in scope

Backfilling current subscribers with the thank-you, a Slack alert on plan activations, showing the card decline reason, a past-due banner inside the app, trial emails, renewal receipts.
