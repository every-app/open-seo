import type { ReactNode } from "react";

/** A section of the billing Usage tab: a title with "Last 30 days" on the
 *  right. */
export function BillingUsageSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">{title}</h2>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>
      {children}
    </section>
  );
}
