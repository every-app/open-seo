import { StatCard } from "@/client/components/ui/stat-card";
import type { getDashboardOverview } from "@/serverFunctions/dashboard";

type DashboardOverview = Awaited<ReturnType<typeof getDashboardOverview>>;

// Headline numbers from the overview the page already loads. A metric shows
// only when its source has data, so a new project renders no empty tiles.
export function DashboardMetrics({
  overview,
}: {
  overview: DashboardOverview | undefined;
}) {
  const backlinks = overview?.backlinks ?? null;
  const rank = overview?.rank ?? null;
  const metrics: {
    label: string;
    value: string;
    description: string | undefined;
  }[] = [];

  if (backlinks?.referringDomains != null) {
    metrics.push({
      label: "Referring domains",
      value: backlinks.referringDomains.toLocaleString(),
      description: newCount(backlinks.newReferringDomains),
    });
  }
  if (backlinks?.backlinks != null) {
    metrics.push({
      label: "Backlinks",
      value: backlinks.backlinks.toLocaleString(),
      description: newCount(backlinks.newBacklinks),
    });
  }
  if (rank && rank.trackedKeywords > 0) {
    metrics.push({
      label: "Top 10 rankings",
      value: rank.top10.toLocaleString(),
      description: `Across ${rank.trackedKeywords} tracked keywords`,
    });
    metrics.push({
      label: "Rankings improved",
      value: rank.improved.toLocaleString(),
      description: `${rank.declined} declined vs. 7 days ago`,
    });
  }

  if (metrics.length === 0) return null;

  return (
    <section
      aria-label="Key metrics"
      className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
    >
      {metrics.map((metric) => (
        <StatCard
          key={metric.label}
          label={metric.label}
          value={<span className="tabular-nums">{metric.value}</span>}
          description={metric.description}
          className="border border-border p-4 md:p-6"
        />
      ))}
    </section>
  );
}

function newCount(value: number | null): string | undefined {
  return value ? `+${value.toLocaleString()} new` : undefined;
}
