# Credit auto-reload

## Status

Accepted.

## Context

Hosted organizations get monthly usage credits with their plan and can buy top-up credits that never expire (see [hosted metering](0002-hosted-dataforseo-metering-with-autumn.md)). Every purchase goes through Stripe Checkout. An organization that runs out mid-task stops: rank checks are refused, agents report insufficient credits, and someone with the billing role has to notice, open Billing and buy credits by hand.

Customers asked to buy credits automatically, with a cap on how much that can cost them in a month.

## Decision

Billing managers on a paid plan can turn on auto-reload on the Billing page, under the one-off purchase. It has two whole-dollar settings: the amount each reload buys, and a monthly budget, the most the organization spends on top-up credits in a billing cycle. The threshold that triggers a reload is fixed at $5 of top-up credits.

Autumn holds both settings as billing controls on the customer's `topup_credits` balance and enforces them itself. The reload is an `auto_topups` control: after every deduction from or refused check on the top-up balance, Autumn compares the remaining balance with the threshold and, when at or below it, charges the organization's saved card for the reload amount through the existing one-off `credit-top-up` price, adding the credits to the top-up balance. The budget is a `usage_limits` control: a hard cap on top-up credits spent per month, aligned to the billing cycle. Autumn refuses the hold that would take the cycle's spend past it, with credits still in the balance, and counts open holds against it. The budget counts every top-up credit spent, including credits bought by hand, and is in force only while auto-reload is on.

Autumn refuses the hold that would exceed the budget while credits remain, so the spend rarely lands on the limit itself; the app treats the budget as spent once less than the threshold, the largest single hold, is left of it. When the budget is spent, top-up credits are paused until the budget is raised or the cycle resets. The Billing page shows the cycle's spend against the budget and, once it is spent, a notice with a one-click raise; the banner, the insufficient-credits error, the chat agent and the MCP tools say the same and point at Billing. Raising the budget keeps the cycle's count, so the organization carries on from where it stopped. A one-off purchase does not lift the pause, so the page holds the purchase button while the budget is spent and says why.

Turning auto-reload on buys the first reload immediately, before the controls are written, when the organization has never bought a top-up, or when its top-up balance is already at or below the threshold and auto-reload is off or its last reload failed. The server decides this from the customer and the page reads the same decision, so the button says so before the click. A balance above the threshold never buys now, which also means a second click after a charge that landed cannot charge again. Changing the settings while auto-reload already runs leaves the next purchase to Autumn. Turning it off is one click, needs no paid plan, and lifts the budget with it. The cycle's spend is kept while it is off, so turning it back on under a budget that spend has reached is refused, and the page says what budget would do.

Monthly plan credits are still spent first and top-up credits after, so the threshold is in practice a floor on the total balance once the monthly credits are gone, and a spent budget only stops work once they are gone too.

A paid plan that ends turns auto-reload off: the billing webhook that records the plan change disables the controls for a customer who no longer holds the paid entitlement.

When a reload cannot be charged, Autumn reports why through a webhook. The reason is recorded on the Autumn customer so the Billing page, the out-of-credits banner and the insufficient-credits error can say what happened: a declined card points at the billing portal and a retry, anything else at support. Billing managers get an email for card problems. A successful reload, or a successful retry from the page, clears the notice. Autumn's own waits between attempts are not failures.

## Rationale

The budget caps what is spent rather than what is bought. That is the number customers have in mind and the way other prepaid products present it: a monthly spending cap next to the reload, with the card charged only as credits are spent. A cap on purchases makes the customer reason in reloads, and the window Autumn keeps for it is a rolling month from the first reload rather than the billing cycle; the budget resets with the cycle and reads as one number. It bounds the card as well: a cycle's reloads cannot exceed the budget by more than one reload, the one that can land as the budget is reached.

The budget counts credits bought by hand too. A budget on reloaded credits alone would need every deduction to tell the two apart, which Autumn's limit cannot do, and a customer at their budget who wants to spend more says so by raising it.

The first reload is bought by the app rather than left to Autumn because Autumn prices a reload from the organization's own top-up purchase, which an organization that never bought credits does not have, and because Autumn otherwise buys only when a deduction or a refused check crosses the threshold, so the first attempt after enabling would fail before the credits arrived. Buying first also leaves the balance above the threshold, so Autumn's own enable-time purchase does not double up. The same purchase is the retry after a failed reload: a successful charge is what lifts Autumn's pause on a card that kept declining.

The threshold is fixed and below the smallest amount. A user-set threshold is a question most customers cannot answer, and one at or above the amount would make every reload trigger the next. $5 covers the largest single hold a call takes; a larger one is refused and succeeds after smaller usage brings the balance down.

The budget is capped at $1,000 a month because reloads are charged off-session, without Stripe Checkout's confirmation; the budget is what bounds what a stolen card can cost. A purchase-count limit stays on the reload control as a backstop, at twice the reloads a cycle's budget can need plus one, which the budget keeps out of reach.

The failure notice lives in the Autumn customer's metadata because the billing page already reads that customer on every page load and Autumn is the source of truth for the controls it describes; a table of our own would add a second read and a migration for one flag.

## Alternatives considered

- **A cap on purchases.** A monthly limit on how many reloads Autumn may buy, which is what some API platforms offer. It bounds the card directly, but customers would have to think in reloads, the limit would be a multiple of the reload amount, its window is a rolling month, and credits bought by hand would fall outside it. Rejected for the budget on spend.
- **A budget on reloaded credits only.** Would let hand-bought credits spend freely under a spent budget. Autumn's limit counts all spend on the balance, and separating the two would put the budget back in the app on every deduction.
- **Post-paid overage.** Price top-up credits as overage on the plan's invoice with a spend limit, as some developer tools do. One number and no balance to watch, but it extends credit for real provider costs, so a declined card after a month of use is a loss, and it needs a new plan version. Rejected while the plan is $10 a month.
- **A user-set threshold.** Lets an agency keep a larger floor for big batches, but it is a question most customers cannot answer, and one at or above the reload amount would chain reloads.
- **Recurring top-up subscription.** Buys the same amount every month whether or not it is needed. Auto-reload buys only when the balance is low.
- **Reloading from inside the metered call path.** The app could buy credits when a hold is refused and retry. It would duplicate Autumn's purchase counting and put a card charge on the hot path of every DataForSEO call.

## Consequences

- Autumn's own trigger covers the reloads and its usage limit the budget; the app turns them on and off, primes the first purchase, reads the state back and handles the webhooks. No catalog change and no schema change.
- The budget resets with the billing cycle, so the page shows the monthly credits' refill date as the reset. Spend from before the budget was created does not count, and nothing counts while auto-reload is off.
- A hold refused by the budget comes back with the balance still showing credits. The metering code reads a positive balance that refuses as the budget, refuses the batch without retrying it smaller, and says so in the error; the chat gate refuses on it without the stale-balance confirmation it does for an empty balance.
- The first call refused after the monthly credits run out can still fail while Autumn's purchase is in flight; the next call succeeds. The threshold is what keeps that rare.
- A reload can land as the budget is reached, when the balance is at the threshold. Those credits wait for the next cycle or a raised budget; they never expire.
- Research priced after the fact (LLM usage) is admitted on the balance before it runs. If the budget is reached during such a run, the part of that run's top-up deduction past the budget is not deducted; Autumn stops deducting there. Bounded to one run.
- Repeated card declines make Autumn pause reloads until a payment method succeeds. The notice on the Billing page points at the billing portal and offers the retry.
