import { Bar, BarChart } from "recharts";
import type { BillingUsage } from "@/server/billing/usage";
import { QueryState } from "@/client/components/QueryState";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { BillingUsageSection } from "@/client/features/billing/BillingUsageSection";
import { useBillingUsage } from "@/client/features/billing/useBillingUsage";

const chartConfig = {
  usd: { label: "Usage", color: "#7c3aed" },
} satisfies ChartConfig;

export function BillingUsageChart() {
  const usageQuery = useBillingUsage();

  return (
    <BillingUsageSection title="Usage">
      <QueryState
        query={usageQuery}
        errorFallback="Failed to load usage"
        loading={<Skeleton className="h-40 w-full" />}
      >
        {(usage) => <UsageChart days={usage.days} />}
      </QueryState>
    </BillingUsageSection>
  );
}

function UsageChart({ days }: { days: BillingUsage["days"] }) {
  const totalSpend = days.reduce((sum, day) => sum + day.usd, 0);

  return (
    <div className="space-y-3">
      <div className="text-2xl font-semibold tabular-nums">
        ${totalSpend.toFixed(2)}
      </div>

      <div className="h-32 w-full min-w-0">
        {totalSpend === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted-foreground">
              No usage recorded yet
            </span>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full">
            <BarChart
              data={days}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
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
        )}
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
