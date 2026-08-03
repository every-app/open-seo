import { useQuery } from "@tanstack/react-query";
import { RapidapiConnectionCard } from "@/client/features/revenue/RapidapiConnectionCard";
import { StripeConnectionCard } from "@/client/features/revenue/StripeConnectionCard";
import { getRapidapiSubscriptions } from "@/serverFunctions/rapidapi";
import { getStripeRevenue } from "@/serverFunctions/stripe";

/**
 * Revenue for this project from two sources: RapidAPI marketplace
 * subscriptions and Stripe (a subscription product and/or a one-off purchase
 * product). Each panel connects independently; both compare the last 30 days
 * to the prior 30. Deliberately PII-free — subscriber identities are opaque
 * ids only. See specs/0014.
 */
export function RevenuePage({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Revenue</h1>
        <p className="text-sm text-base-content/70">
          Subscribers, churn, and purchases from RapidAPI and Stripe.
        </p>
      </div>
      <StripePanel projectId={projectId} />
      <RapidapiPanel projectId={projectId} />
    </div>
  );
}

function RapidapiPanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["rapidapiSubscriptions", projectId],
    queryFn: () => getRapidapiSubscriptions({ data: { projectId } }),
  });
  const data = query.data;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">RapidAPI</h2>
      {query.isLoading ? (
        <PanelLoading label="Loading RapidAPI subscriptions…" />
      ) : query.isError ? (
        <PanelError onRetry={() => void query.refetch()} />
      ) : !data?.connected ? (
        <div className="max-w-2xl">
          <RapidapiConnectionCard projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/60">
            <span className="font-mono">
              {data.apiName ?? data.rapidapiApiId}
            </span>{" "}
            · last 30 days vs prior 30
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Active subscribers"
              value={String(data.metrics.activeSubscribers)}
            />
            <StatTile
              label="Paying subscribers"
              value={
                data.metrics.payingSubscribers === null
                  ? "—"
                  : String(data.metrics.payingSubscribers)
              }
              hint={
                data.metrics.payingSubscribers === null
                  ? "This hub's Platform API doesn't expose plan prices."
                  : undefined
              }
            />
            <DeltaTile
              label="New (30d)"
              value={data.metrics.newLast30}
              previous={data.metrics.newPrev30}
            />
            <DeltaTile
              label="Churned (30d)"
              value={data.metrics.churnedLast30}
              previous={data.metrics.churnedPrev30}
              betterWhenLower
            />
          </div>
          <RecentSubscriptionsTable rows={data.recent} />
        </div>
      )}
    </section>
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

function RecentSubscriptionsTable({
  rows,
}: {
  rows: Array<{
    id: string;
    entityId: string | null;
    entityType: string | null;
    planName: string | null;
    planPrice: number | null;
    status: string | null;
    createdAt: string | null;
    canceledAt: string | null;
  }>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm lg:max-w-3xl">
      <h3 className="border-b border-base-300 p-4 text-sm font-semibold">
        Recent subscriptions
      </h3>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Started</th>
              <th>Canceled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">
                  {row.entityId ?? "—"}
                  {row.entityType ? (
                    <span className="ml-2 badge badge-ghost badge-xs">
                      {row.entityType.toLowerCase()}
                    </span>
                  ) : null}
                </td>
                <td>
                  {row.planName ?? "—"}
                  {(row.planPrice ?? 0) > 0 ? (
                    <span className="ml-2 badge badge-primary badge-outline badge-xs">
                      paid
                    </span>
                  ) : null}
                </td>
                <td>{row.status?.toLowerCase() ?? "—"}</td>
                <td className="tabular-nums">{formatDay(row.createdAt)}</td>
                <td className="tabular-nums">{formatDay(row.canceledAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

/** Minor currency units → localized amount, e.g. (12300, "usd") → "$123". */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <span className="mt-1 block text-2xl font-semibold tabular-nums">
        {value}
      </span>
      {hint ? (
        <p className="mt-1 text-xs text-base-content/50">{hint}</p>
      ) : null}
    </div>
  );
}

function DeltaTile({
  label,
  value,
  previous,
  betterWhenLower = false,
  format = String,
}: {
  label: string;
  value: number;
  previous: number;
  betterWhenLower?: boolean;
  format?: (value: number) => string;
}) {
  const diff = value - previous;
  const improved = betterWhenLower ? diff <= 0 : diff >= 0;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">
          {format(value)}
        </span>
        <span
          className={`text-xs ${improved ? "text-success" : "text-error"}`}
          title="vs the prior 30 days"
        >
          {diff >= 0 ? "+" : "−"}
          {format(Math.abs(diff))} prev
        </span>
      </div>
    </div>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      {label}
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-error">Couldn't load this panel.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
