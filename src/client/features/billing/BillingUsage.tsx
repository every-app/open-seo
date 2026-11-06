import { Bar, BarChart } from "recharts";
import { ChartColumn, Info } from "lucide-react";
import type { BillingUsage as BillingUsageData } from "@/server/billing/usage";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import { EmptyState } from "@/client/components/EmptyState";
import { QueryState } from "@/client/components/QueryState";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useBillingUsage } from "@/client/features/billing/useBillingUsage";

// Usage events carry a project from Nov 1, 2026. Until that day leaves the
// 30-day window, older usage still shows as Workspace.
const PROJECT_USAGE_COMPLETE_AT = Date.parse("2026-12-02T00:00:00Z");

const chartConfig = {
  usd: { label: "Usage", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** The billing Usage tab: the last 30 days by day, feature and project. */
export function BillingUsage() {
  const usageQuery = useBillingUsage();

  return (
    <QueryState
      query={usageQuery}
      errorFallback="Failed to load usage"
      loading={<UsageSkeleton />}
    >
      {(usage) => <UsageReport usage={usage} />}
    </QueryState>
  );
}

function UsageReport({ usage }: { usage: BillingUsageData }) {
  const totalUsd = usage.days.reduce((sum, day) => sum + day.usd, 0);

  // Every section would be empty, so one empty state stands for all three.
  if (totalUsd === 0) {
    return (
      <EmptyState
        variant="plain"
        icon={ChartColumn}
        title="No usage recorded yet"
        description="What you spend over the last 30 days shows up here, by day, feature and project."
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">
            Spent in the last 30 days
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            ${totalUsd.toFixed(2)}
          </p>
        </div>
        <UsageChart days={usage.days} />
      </section>

      {Date.now() < PROJECT_USAGE_COMPLETE_AT ? (
        <Alert>
          <Info />
          <AlertDescription>
            Project tracking started Nov 1, so earlier usage shows as Workspace.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 md:grid-cols-2">
        <Breakdown title="Usage by feature" rows={usage.features} />
        <Breakdown title="Usage by project" rows={usage.projects} />
      </div>
    </div>
  );
}

function UsageChart({ days }: { days: BillingUsageData["days"] }) {
  return (
    <div className="h-40 w-full min-w-0">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={days} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <ChartGrid />
          <ChartXAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            minTickGap={40}
          />
          <ChartYAxis tickFormatter={formatUsdAxis} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label: unknown) =>
                  typeof label === "number" ? formatShortDate(label) : ""
                }
                valueFormatter={(value) => `$${Number(value).toFixed(2)}`}
              />
            }
          />
          <Bar
            dataKey="usd"
            fill="var(--color-usd)"
            radius={[2, 2, 0, 0]}
            maxBarSize={12}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: BillingUsageData["features"];
}) {
  const total = rows.reduce((sum, row) => sum + row.usd, 0);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="text-muted-foreground tabular-nums">
                ${row.usd.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${(row.usd / total) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UsageSkeleton() {
  return (
    <div aria-busy className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="space-y-3">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatUsdAxis(value: number) {
  return `$${value % 1 === 0 ? value : value.toFixed(2)}`;
}
