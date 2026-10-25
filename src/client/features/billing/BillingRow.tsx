import type { ReactNode } from "react";

/**
 * One line of the billing summary: a label, what is set now, and the action
 * that changes it. A form opened by the action goes in `children`, under the
 * summary, so the list stays short until someone edits.
 */
export function BillingRow({
  label,
  summary,
  action,
  children,
}: {
  label: string;
  summary: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
      <p className="text-sm font-medium">{label}</p>
      <div className="min-w-0 text-sm text-muted-foreground">{summary}</div>
      {action ? <div className="sm:justify-self-end">{action}</div> : null}
      {children ? (
        <div className="min-w-0 space-y-3 empty:hidden sm:col-span-2 sm:col-start-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
