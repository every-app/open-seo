import {
  Activity,
  BarChart3,
  Eye,
  Gauge,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { GrowthPanels } from "./GrowthPanels";
import { InsightPanels } from "./InsightPanels";

const overviewMetrics = [
  {
    label: "SEO visibility",
    value: "72%",
    change: "+8.4%",
    note: "Across tracked keywords",
    icon: Eye,
    accent: "text-primary bg-primary/10",
  },
  {
    label: "Organic traffic",
    value: "18.4K",
    change: "+12.7%",
    note: "Estimated monthly visits",
    icon: TrendingUp,
    accent: "text-info bg-info/10",
  },
  {
    label: "Ranking keywords",
    value: "1,284",
    change: "+96",
    note: "300 keywords in top 10",
    icon: Search,
    accent: "text-primary bg-primary/10",
  },
  {
    label: "Site health",
    value: "92",
    change: "+4",
    note: "7 technical issues open",
    icon: Gauge,
    accent: "text-warning bg-warning/10",
  },
] as const;

export function DgtlOverview({ projectId }: { projectId: string }) {
  return (
    <div className="dgtl-overview space-y-6">
      <OverviewHero />
      <OverviewMetrics />
      <GrowthPanels />
      <InsightPanels projectId={projectId} />
      <DemoDataNotice />
    </div>
  );
}

function OverviewHero() {
  return (
    <section className="dgtl-overview-header border-b border-base-300 pb-6">
      <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
              <Activity className="size-4" aria-hidden="true" /> SEO workspace
            </span>
            <span className="badge badge-outline text-sm">
              Sample report · not live data
            </span>
          </div>
          <h1 className="max-w-2xl text-[28px] font-semibold leading-tight tracking-tight">
            Search performance overview
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-base-content/75">
            Explore the sample report, then connect your website’s data using
            the workspace setup below.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-base-content/75">Sample growth score</p>
            <p className="text-3xl font-semibold tabular-nums text-primary">
              84<span className="text-sm text-base-content/75">/100</span>
            </p>
          </div>
          <div className="grid size-12 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewMetrics() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {overviewMetrics.map(
        ({ label, value, change, note, icon: Icon, accent }) => (
          <article
            key={label}
            className="rounded-xl border border-base-300 bg-base-100 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-base-content/75">{label}</span>
              <span
                className={`grid size-9 place-items-center rounded-xl ${accent}`}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {value}
              </p>
              <span className="mb-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {change}
              </span>
            </div>
            <p className="mt-2 text-sm text-base-content/75">{note}</p>
          </article>
        ),
      )}
    </section>
  );
}

function DemoDataNotice() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-sm text-base-content/80">
      <BarChart3 className="size-5 shrink-0 text-primary" />
      This overview contains sample figures, not measurements for your website.
      Review your connected data in the relevant tools and integration panels.
    </div>
  );
}
