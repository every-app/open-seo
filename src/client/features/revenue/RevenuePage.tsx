import { useQuery } from "@tanstack/react-query";
import { RapidapiSnapshotsPanel } from "@/client/features/revenue/RapidapiSnapshotsPanel";
import { StripeConnectionCard } from "@/client/features/revenue/StripeConnectionCard";
import {
  DeltaTile,
  formatMoney,
  PanelError,
  PanelLoading,
  StatTile,
} from "@/client/features/revenue/revenueParts";
import { getStripeRevenue } from "@/serverFunctions/stripe";

/**
 * Revenue for this project from two sources: Stripe (live, a subscription
 * product and/or a one-off purchase product, last 30 days vs prior 30) and
 * RapidAPI (manually-logged subscriber snapshots — RapidAPI has no platform
 * API for public-marketplace subscriber data, per support 2026-08-04).
 * Deliberately PII-free — counts and amounts only. See specs/0014.
 */
export function RevenuePage({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Revenue</h1>
        <p className="text-sm text-base-content/70">
          Subscribers, churn, and purchases from Stripe and RapidAPI.
        </p>
      </div>
      <StripePanel projectId={projectId} />
      <RapidapiSnapshotsPanel projectId={projectId} />
    </div>
  );
}

function StripePanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["stripeRevenue", projectId],
    queryFn: () => getStripeRevenue({ data: { projectId } }),
  });
  const data = query.data;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Stripe</h2>
      {query.isLoading ? (
        <PanelLoading label="Loading Stripe revenue…" />
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : !data?.connected ? (
        <div className="max-w-2xl">
          <StripeConnectionCard projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-6">
          {data.subscription ? (
            <div className="space-y-3">
              <p className="text-sm text-base-content/60">
                <span className="font-mono">
                  {data.subscription.productName ?? data.subscription.productId}
                </span>{" "}
                · subscriptions · last 30 days vs prior 30
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Active subscribers"
                  value={String(data.subscription.activeSubscribers)}
                />
                <StatTile
                  label="Est. MRR"
                  value={
                    data.subscription.mrr
                      ? formatMoney(
                          data.subscription.mrr.amount,
                          data.subscription.mrr.currency,
                        )
                      : "—"
                  }
                />
                <DeltaTile
                  label="New (30d)"
                  value={data.subscription.newLast30}
                  previous={data.subscription.newPrev30}
                />
                <DeltaTile
                  label="Churned (30d)"
                  value={data.subscription.churnedLast30}
                  previous={data.subscription.churnedPrev30}
                  betterWhenLower
                />
              </div>
            </div>
          ) : null}
          {data.oneOff ? <OneOffTiles oneOff={data.oneOff} /> : null}
        </div>
      )}
    </section>
  );
}

function OneOffTiles({
  oneOff,
}: {
  oneOff: {
    productId: string;
    productName: string | null;
    purchasesLast30: number;
    purchasesPrev30: number;
    revenueLast30: number;
    revenuePrev30: number;
    currency: string | null;
    refunds: {
      refundsLast30: number;
      refundsPrev30: number;
      refundAmountLast30: number;
      refundAmountPrev30: number;
    } | null;
  };
}) {
  const money = (amount: number) =>
    oneOff.currency ? formatMoney(amount, oneOff.currency) : String(amount);
  const { refunds } = oneOff;
  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/60">
        <span className="font-mono">
          {oneOff.productName ?? oneOff.productId}
        </span>{" "}
        · one-off purchases · last 30 days vs prior 30
      </p>
      <div
        className={`grid grid-cols-2 gap-3 ${refunds ? "lg:grid-cols-4" : "lg:max-w-xl"}`}
      >
        <DeltaTile
          label="Purchases (30d)"
          value={oneOff.purchasesLast30}
          previous={oneOff.purchasesPrev30}
        />
        <DeltaTile
          label="Gross revenue (30d)"
          value={oneOff.revenueLast30}
          previous={oneOff.revenuePrev30}
          format={money}
        />
        {refunds ? (
          <>
            <DeltaTile
              label="Refunds (30d)"
              value={refunds.refundAmountLast30}
              previous={refunds.refundAmountPrev30}
              betterWhenLower
              format={money}
            />
            <DeltaTile
              label="Net revenue (30d)"
              value={oneOff.revenueLast30 - refunds.refundAmountLast30}
              previous={oneOff.revenuePrev30 - refunds.refundAmountPrev30}
              format={money}
            />
          </>
        ) : null}
      </div>
      {refunds ? null : (
        <p className="text-xs text-base-content/50">
          Refunds and net revenue need Refunds read access on STRIPE_SECRET_KEY.
        </p>
      )}
    </div>
  );
}
