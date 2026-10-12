import { Bar, BarChart } from "recharts";
import { sort } from "remeda";
import { autumnSeoDataCreditsToUsd } from "@/shared/billing";
import type { BillingUsageEvent } from "@/serverFunctions/billing";
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
import { BillingUsageCard } from "@/client/features/billing/BillingUsageCard";
import {
  BILLING_USAGE_DAYS,
  useBillingUsageEvents,
} from "@/client/features/billing/useBillingUsageEvents";

const chartConfig = {
  credits: { label: "Usage", color: "#7c3aed" },
} satisfies ChartConfig;

export function BillingUsageChart() {
  const eventsQuery = useBillingUsageEvents();

  return (
    <BillingUsageCard title="Usage">
      <QueryState
        query={eventsQuery}
        errorFallback="Failed to load usage"
        loading={<Skeleton className="h-40 w-full" />}
      >
        {(events) => <UsageChart events={events} />}
      </QueryState>
    </BillingUsageCard>
  );
}

function UsageChart({ events }: { events: BillingUsageEvent[] }) {
  const chartData = binEventsByDay(events);
  const totalSpend = chartData.reduce((sum, d) => sum + d.credits, 0);

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
              data={chartData}
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
                dataKey="credits"
                fill="var(--color-credits)"
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

/**
 * One bar for each local day, from 30 days ago to today, in USD. An event
 * older than that (cached data after midnight) gets its own bar, so the
 * total still matches the per-feature breakdown.
 */
function binEventsByDay(events: BillingUsageEvent[]) {
  const creditsByDay = new Map<number, number>();
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - BILLING_USAGE_DAYS);
  for (let i = 0; i <= BILLING_USAGE_DAYS; i++) {
    creditsByDay.set(day.getTime(), 0);
    day.setDate(day.getDate() + 1);
  }

  for (const event of events) {
    const eventDay = new Date(event.timestamp).setHours(0, 0, 0, 0);
    creditsByDay.set(eventDay, (creditsByDay.get(eventDay) ?? 0) + event.value);
  }

  return sort([...creditsByDay], ([a], [b]) => a - b).map(
    ([date, credits]) => ({
      date,
      credits: autumnSeoDataCreditsToUsd(credits),
    }),
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
