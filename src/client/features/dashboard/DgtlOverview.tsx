import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Eye,
  Flame,
  Gauge,
  Globe2,
  Link2,
  MousePointerClick,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const trafficTrend = [
  { label: "Aug 22", traffic: 10300, visibility: 52 },
  { label: "Aug 26", traffic: 11200, visibility: 54 },
  { label: "Aug 30", traffic: 11950, visibility: 57 },
  { label: "Sep 3", traffic: 13100, visibility: 59 },
  { label: "Sep 7", traffic: 14250, visibility: 63 },
  { label: "Sep 11", traffic: 15100, visibility: 66 },
  { label: "Sep 15", traffic: 16800, visibility: 69 },
  { label: "Sep 18", traffic: 18420, visibility: 72 },
];

const positionBuckets = [
  { label: "Top 3", value: 86, color: "#34d399" },
  { label: "4–10", value: 214, color: "#22d3ee" },
  { label: "11–20", value: 337, color: "#818cf8" },
  { label: "21–100", value: 647, color: "#64748b" },
];

const channelShare = [
  { name: "Organic", value: 58, color: "#34d399" },
  { name: "Direct", value: 24, color: "#22d3ee" },
  { name: "Referral", value: 11, color: "#818cf8" },
  { name: "Social", value: 7, color: "#f59e0b" },
];

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

const opportunities = [
  {
    keyword: "digital marketing sri lanka",
    position: 11,
    volume: "2.4K",
    intent: "Commercial",
  },
  {
    keyword: "seo agency colombo",
    position: 14,
    volume: "880",
    intent: "Transactional",
  },
  {
    keyword: "social media marketing sri lanka",
    position: 18,
    volume: "1.3K",
    intent: "Commercial",
  },
] as const;

function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-base-300/80 bg-base-100 shadow-sm ${className}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-base-300/70 px-5 py-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-semibold tracking-tight">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-base-content/50">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="text-xs font-medium tabular-nums">
          {item.name}: {item.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export function DgtlOverview({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-5">
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map(({ label, value, change, note, icon: Icon, accent }) => (
          <article
            key={label}
            className="group rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-base-content/55">{label}</span>
              <span className={`grid size-9 place-items-center rounded-xl ${accent}`}>
                <Icon className="size-4" />
              </span>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
              <span className="mb-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{change}</span>
            </div>
            <p className="mt-2 text-xs text-base-content/45">{note}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
        <Panel
          title="Organic growth trend"
          eyebrow="Visibility + traffic"
          action={<span className="text-xs text-base-content/45">Last 28 days</span>}
        >
          <div className="p-5">
            <div className="mb-5 flex flex-wrap gap-5 text-xs text-base-content/55">
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-emerald-400" /> Organic traffic</span>
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-cyan-400" /> Visibility %</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficTrend} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.45 }} />
                  <YAxis yAxisId="traffic" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.4 }} />
                  <YAxis yAxisId="visibility" orientation="right" hide domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.12 }} />
                  <Area yAxisId="traffic" type="monotone" dataKey="traffic" name="Traffic" stroke="#34d399" strokeWidth={2.5} fill="url(#trafficFill)" />
                  <Area yAxisId="visibility" type="monotone" dataKey="visibility" name="Visibility" stroke="#22d3ee" strokeWidth={2} fill="transparent" strokeDasharray="5 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        <Panel title="Search position spread" eyebrow="1,284 keywords">
          <div className="p-5">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={positionBuckets} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.4 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.04 }} />
                  <Bar dataKey="value" name="Keywords" radius={[7, 7, 2, 2]}>
                    {positionBuckets.map((item) => <Cell key={item.label} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-success/10 p-3"><p className="text-xs text-base-content/50">Improved</p><p className="mt-1 font-semibold text-success">128 keywords</p></div>
              <div className="rounded-xl bg-error/10 p-3"><p className="text-xs text-base-content/50">Declined</p><p className="mt-1 font-semibold text-error">34 keywords</p></div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Technical health" eyebrow="Site audit">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center rounded-full border-[7px] border-emerald-400/25 bg-emerald-400/5 text-2xl font-semibold text-emerald-400">92</div>
              <div><p className="font-medium">Healthy foundation</p><p className="mt-1 text-xs leading-5 text-base-content/50">184 pages crawled · updated today</p></div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-error/8 px-3 py-2"><span className="flex items-center gap-2"><CircleAlert className="size-4 text-error" /> Critical</span><b className="tabular-nums">2</b></div>
              <div className="flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2"><span className="flex items-center gap-2"><CircleAlert className="size-4 text-warning" /> Warnings</span><b className="tabular-nums">5</b></div>
              <div className="flex items-center justify-between rounded-lg bg-success/8 px-3 py-2"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Passed checks</span><b className="tabular-nums">47</b></div>
            </div>
            <Link to="/p/$projectId/audit" params={{ projectId }} className="btn btn-sm w-full">Review all issues <ArrowRight className="size-4" /></Link>
          </div>
        </Panel>

        <Panel title="Acquisition mix" eyebrow="Web analytics">
          <div className="flex items-center gap-3 p-5">
            <div className="h-44 min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={channelShare} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={3} stroke="none">
                    {channelShare.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {channelShare.map((item) => (
                <div key={item.name} className="flex min-w-28 items-center justify-between gap-4 text-xs"><span className="flex items-center gap-2 text-base-content/55"><i className="size-2 rounded-full" style={{ background: item.color }} />{item.name}</span><b>{item.value}%</b></div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Link authority" eyebrow="Backlink profile">
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-base-200 p-3"><Link2 className="size-4 text-indigo-400" /><p className="mt-4 text-2xl font-semibold">4,836</p><p className="text-xs text-base-content/45">Backlinks</p></div>
              <div className="rounded-xl bg-base-200 p-3"><Globe2 className="size-4 text-cyan-400" /><p className="mt-4 text-2xl font-semibold">312</p><p className="text-xs text-base-content/45">Ref. domains</p></div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-base-300 pt-4 text-sm"><span className="text-base-content/55">Authority score</span><span className="flex items-center gap-2 font-semibold"><span className="size-2 rounded-full bg-emerald-400" /> 61 / 100</span></div>
            <Link to="/p/$projectId/backlinks" params={{ projectId }} search={{ target: "dgtl.lk", scope: "domain" }} className="btn btn-ghost btn-sm mt-3 w-full">Explore backlinks <ArrowUpRight className="size-4" /></Link>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Quick-win opportunities" eyebrow="Action center" action={<Target className="size-4 text-primary" />}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Keyword</th><th>Position</th><th>Volume</th><th>Intent</th><th /></tr></thead>
              <tbody>
                {opportunities.map((item) => (
                  <tr key={item.keyword}>
                    <td className="font-medium">{item.keyword}</td>
                    <td><span className="badge badge-sm badge-warning">#{item.position}</span></td>
                    <td className="tabular-nums">{item.volume}</td>
                    <td className="text-base-content/55">{item.intent}</td>
                    <td><Link to="/p/$projectId/keywords" params={{ projectId }} search={{ q: item.keyword }} className="btn btn-ghost btn-xs btn-square" aria-label={`Research ${item.keyword}`}><ArrowUpRight className="size-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Visitor behavior" eyebrow="Microsoft Clarity">
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-base-200 p-3"><MousePointerClick className="size-4 text-rose-400" /><p className="mt-3 text-2xl font-semibold">126</p><p className="text-xs text-base-content/45">Rage clicks</p></div>
              <div className="rounded-xl bg-base-200 p-3"><Flame className="size-4 text-orange-400" /><p className="mt-3 text-2xl font-semibold">68%</p><p className="text-xs text-base-content/45">Avg. scroll depth</p></div>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/8 p-3 text-xs leading-5 text-base-content/65">Pricing and contact pages show the highest hesitation. Review mobile recordings first.</div>
            <Link to="/p/$projectId/clarity" params={{ projectId }} className="btn btn-sm w-full">Open behavior insights <ArrowRight className="size-4" /></Link>
          </div>
        </Panel>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-base-content/65">
        <BarChart3 className="size-5 shrink-0 text-primary" />
        All figures in the DGTL overview are demonstration data. Connected DataForSEO, GA4, Search Console, audit, and Clarity sources will replace them.
      </div>
    </div>
  );
}
