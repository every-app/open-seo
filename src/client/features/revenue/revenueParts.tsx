/** Tiles and panel states shared by the Revenue page's panels and the
 *  dashboard revenue card. */

/** Minor currency units → localized amount, e.g. (12300, "usd") → "$123".
 *  Pass fractionDigits for small amounts where cents matter ($5.99 plans). */
export function formatMoney(
  amountMinor: number,
  currency: string,
  fractionDigits = 0,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: fractionDigits,
  }).format(amountMinor / 100);
}

export function StatTile({
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

export function DeltaTile({
  label,
  value,
  previous,
  previousLabel = "the prior 30 days",
  betterWhenLower = false,
  format = String,
}: {
  label: string;
  value: number;
  previous: number;
  previousLabel?: string;
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
          title={`vs ${previousLabel}`}
        >
          {diff >= 0 ? "+" : "−"}
          {format(Math.abs(diff))} prev
        </span>
      </div>
    </div>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-base-content/50">
      <span className="loading loading-spinner loading-sm" />
      {label}
    </div>
  );
}

export function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-error">Couldn't load this panel.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
