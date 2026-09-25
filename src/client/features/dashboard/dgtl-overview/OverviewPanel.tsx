import type { ReactNode } from "react";

export function OverviewPanel({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 px-5 py-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-sm font-medium text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-xl font-semibold leading-snug">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function OverviewChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-base-content/50">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-xs font-medium tabular-nums">
          {item.name}: {item.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}
