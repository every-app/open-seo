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
    accent: "text-emerald-300 bg-emerald-400/10",
  },
  {
    label: "Organic traffic",
    value: "18.4K",
    change: "+12.7%",
    note: "Estimated monthly visits",
    icon: TrendingUp,
    accent: "text-cyan-300 bg-cyan-400/10",
  },
  {
    label: "Ranking keywords",
    value: "1,284",
    change: "+96",
    note: "300 keywords in top 10",
    icon: Search,
    accent: "text-indigo-300 bg-indigo-400/10",
  },
  {
    label: "Site health",
    value: "92",
    change: "+4",
    note: "7 technical issues open",
    icon: Gauge,
    accent: "text-amber-300 bg-amber-400/10",
  },
] as const;

export function DgtlOverview({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-5">
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
    <section className="relative overflow-hidden rounded-3xl border border-emerald-400/15 bg-[#09110f] p-6 text-white shadow-2xl shadow-emerald-950/20 sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(52,211,153,.20),transparent_28%),radial-gradient(circle_at_20%_100%,rgba(34,211,238,.10),transparent_35%)]" />
      <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              <Activity className="size-3.5" /> DGTL performance command center
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/55">
              Demo data
            </span>
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Your search growth, clearly connected.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            A single view of visibility, traffic, rankings, site quality, links,
            and visitor behavior for this client website.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-white/40">Overall growth score</p>
            <p className="text-3xl font-semibold tabular-nums text-emerald-300">
              84<span className="text-sm text-white/35">/100</span>
            </p>
          </div>
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-black">
            <Sparkles className="size-5" />
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
            className="group rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-base-content/55">{label}</span>
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
            <p className="mt-2 text-xs text-base-content/45">{note}</p>
          </article>
        ),
      )}
    </section>
  );
}

function DemoDataNotice() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-base-content/65">
      <BarChart3 className="size-5 shrink-0 text-primary" />
      All figures in the DGTL overview are demonstration data. Connected
      DataForSEO, GA4, Search Console, audit, and Clarity sources will replace
      them.
    </div>
  );
}
