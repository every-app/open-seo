import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  EmptyCardBody,
  moreDetailsClass,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import { formatMoney } from "@/client/features/revenue/revenueParts";
import { getStripeRevenue } from "@/serverFunctions/stripe";

export function RevenueCard({ projectId }: { projectId: string }) {
  // Same key as the Revenue page's Stripe panel — identical call, shared cache.
  const revenueQuery = useQuery({
    queryKey: ["stripeRevenue", projectId],
    queryFn: () => getStripeRevenue({ data: { projectId } }),
  });
  const data = revenueQuery.data;

  if (data && !data.connected) {
    return (
      <CardShell title="Revenue">
        <EmptyCardBody
          message="Connect Stripe to see subscribers, MRR and purchases next to your search data."
          cta={
            <Link
              to="/p/$projectId/revenue"
              params={{ projectId }}
              className="btn btn-primary btn-sm"
            >
              Set up revenue
            </Link>
          }
        />
      </CardShell>
    );
  }

  const subscription = data?.connected ? data.subscription : null;
  const oneOff = data?.connected ? data.oneOff : null;
  const refunds = oneOff?.refunds ?? null;

  return (
    <CardShell
      title="Revenue"
      stamp={
        subscription || oneOff ? "Stripe · last 30 days vs prior 30" : undefined
      }
      action={
        <Link
          to="/p/$projectId/revenue"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
        </Link>
      }
    >
      {revenueQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : revenueQuery.isError ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Stripe revenue. Try again shortly.
        </p>
      ) : !subscription && !oneOff ? (
        <p className="text-sm text-base-content/60">
          Pick your Stripe products on the Revenue page to see metrics here.
        </p>
      ) : (
        // Full-width card: the four tiles share one row on large screens.
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {subscription ? (
            <>
              <Stat
                label="Subscribers"
                value={subscription.activeSubscribers.toLocaleString()}
              />
              <Stat
                label="Est. MRR"
                value={
                  subscription.mrr
                    ? formatMoney(
                        subscription.mrr.amount,
                        subscription.mrr.currency,
                      )
                    : "—"
                }
              />
            </>
          ) : null}
          {oneOff ? (
            <>
              <Stat
                label="Purchases (30d)"
                value={oneOff.purchasesLast30.toLocaleString()}
                sub={
                  <PercentDelta
                    current={oneOff.purchasesLast30}
                    previous={oneOff.purchasesPrev30}
                  />
                }
              />
              <Stat
                label={refunds ? "Net revenue (30d)" : "Revenue (30d)"}
                value={
                  oneOff.currency
                    ? formatMoney(
                        oneOff.revenueLast30 -
                          (refunds?.refundAmountLast30 ?? 0),
                        oneOff.currency,
                      )
                    : "—"
                }
                sub={
                  <PercentDelta
                    current={
                      oneOff.revenueLast30 - (refunds?.refundAmountLast30 ?? 0)
                    }
                    previous={
                      oneOff.revenuePrev30 - (refunds?.refundAmountPrev30 ?? 0)
                    }
                  />
                }
              />
            </>
          ) : null}
        </div>
      )}
    </CardShell>
  );
}
