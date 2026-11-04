import { Info } from "lucide-react";
import type { BillingUsage } from "@/server/billing/usage";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";
import { BillingUsageSection } from "@/client/features/billing/BillingUsageSection";
import { useBillingUsage } from "@/client/features/billing/useBillingUsage";

// Usage events carry a project from Nov 1, 2026. Until that day leaves the
// 30-day window, older usage still shows as Workspace.
const PROJECT_USAGE_COMPLETE_AT = Date.parse("2026-12-02T00:00:00Z");

/** Last 30 days of usage split by feature or by project. */
export function BillingFeatureBreakdown({
  by,
}: {
  by: "features" | "projects";
}) {
  const usageQuery = useBillingUsage();

  return (
    <BillingUsageSection
      title={by === "features" ? "Usage by feature" : "Usage by project"}
    >
      {by === "projects" && Date.now() < PROJECT_USAGE_COMPLETE_AT ? (
        <Alert className="mb-4">
          <Info />
          <AlertDescription>
            Project tracking started Nov 1, so earlier usage shows as Workspace.
          </AlertDescription>
        </Alert>
      ) : null}
      <QueryState
        query={usageQuery}
        errorFallback="Failed to load usage"
        loading={
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        }
      >
        {(usage) => <BreakdownRows rows={usage[by]} />}
      </QueryState>
    </BillingUsageSection>
  );
}

function BreakdownRows({ rows }: { rows: BillingUsage["features"] }) {
  const total = rows.reduce((sum, row) => sum + row.usd, 0);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No usage recorded yet</div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted-foreground">
              ${row.usd.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#7c3aed]"
              style={{ width: `${(row.usd / total) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
