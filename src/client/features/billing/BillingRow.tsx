import type { ReactNode } from "react";

/**
 * One setting in the billing card: its name over what is set now, and the
 * action that changes it on the right. A form opened by the action goes in
 * `children`, under the row, so the card stays short until someone edits.
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
    // Gaps, not margins, so an empty `children` adds no space.
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">{label}</h3>
          <div className="text-sm text-muted-foreground">{summary}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className="flex min-w-0 flex-col gap-3 empty:hidden">
          {children}
        </div>
      ) : null}
    </div>
  );
}
