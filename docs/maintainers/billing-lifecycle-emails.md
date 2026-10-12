# Billing lifecycle emails: operations

Design lives in `specs/0015-billing-lifecycle-emails.md`. This note covers
what the spec leaves out: how to measure the flow, the Loops-side settings
that are not in code, and the one-off backfill.

## Fix-payment funnel

Events, in order. All carry the user as distinct id and the organization as
the PostHog group, so a funnel can be broken down by plan or by organization.

| Step | Event                               | Where                                                | Properties                       |
| ---- | ----------------------------------- | ---------------------------------------------------- | -------------------------------- |
| 1    | `billing:payment_failed_email_sent` | server, when the webhook sends the Loops event       | `plan_id`                        |
| 2    | `billing:fix_payment_viewed`        | client, first ready render of `/billing/fix-payment` | `past_due`, `can_manage_billing` |
| 3    | `billing:fix_payment_portal_opened` | client, portal button click                          |                                  |
| 4    | `billing:fix_payment_returned`      | client, first ready render after Stripe returns      | `past_due`, `can_manage_billing` |
| 5    | `billing:payment_fixed`             | client, return flow resolved to not past due         |                                  |

Email delivery, opens and clicks are in Loops, not PostHog. Step 1 to step 2
is therefore the email's click-through; Loops has the open rate in between.

Failures, as PostHog exceptions with a `context` property:

- `fix_payment_open_portal`: the Stripe portal session could not be created.
- `fix_payment_check_timeout`: thirty seconds after returning from Stripe the
  subscription was still past due. Every occurrence is worth a look. Compare
  its count to `billing:payment_fixed` to see whether Stripe retries promptly
  on card update or whether people need the "pay it in the portal" nudge.

Session replay is on for the page, inputs masked. Filter replays by the
`billing:fix_payment_viewed` event to watch real attempts.

To build the funnel in PostHog: Insights, Funnels, steps 1 through 5 above,
conversion window 14 days, break down by `plan_id` on step 1. The
step 4 to step 5 drop is the number that says whether the page copy is doing
its job.

## Loops workflow settings that are not in code

Set these in the Loops dashboard on the "Billing: Payment failed" workflow.
The API cannot start workflows or edit their steps, so they were not applied
automatically.

1. **Filter at send time.** Add an audience filter before the email:
   `billingState` equals `past_due`. The webhook writes that property on every
   member before it sends the event, and the backfill script does the same,
   so a customer who fixed their card between the event and the send is
   dropped. Without this the filter is only on who receives the event, not on
   who is still past due when the email goes out.
2. **Second touch.** After the email, add a 48 hour timer, then the same
   `billingState` equals `past_due` filter, then a resend of the email with a
   shorter subject. Most recovered payments in dunning flows come from the
   second touch. The filter means anyone who fixed it in the meantime does
   not get nagged.

The "Billing: Subscription started" workflow already filters on
`billingState` equals `active` before its one week check-in; keep that.

## Backfill

Customers whose subscription, failed payment, or cancellation predates this
feature were handled once with a local script that read live Autumn and sent
the same Loops events with stable idempotency keys, writing each contact's
billing properties first so the workflow filters above applied. It is not in
the repository; the webhook owns everything from deploy onward.
