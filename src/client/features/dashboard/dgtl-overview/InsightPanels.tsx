import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Flame,
  Globe2,
  Link2,
  MousePointerClick,
  Target,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { channelShare, opportunities } from "./demoData";
import { OverviewChartTooltip, OverviewPanel } from "./OverviewPanel";

const healthRowStyles = {
  error: { background: "bg-error/8", icon: "text-error" },
  warning: { background: "bg-warning/10", icon: "text-warning" },
  success: { background: "bg-success/8", icon: "text-success" },
} as const;

export function InsightPanels({ projectId }: { projectId: string }) {
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <TechnicalHealthPanel projectId={projectId} />
        <AcquisitionPanel />
        <LinkAuthorityPanel projectId={projectId} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <OpportunitiesPanel projectId={projectId} />
        <VisitorBehaviorPanel projectId={projectId} />
      </div>
    </>
  );
}

function TechnicalHealthPanel({ projectId }: { projectId: string }) {
  return (
    <OverviewPanel title="Technical health" eyebrow="Site audit">
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-full border-[7px] border-emerald-400/25 bg-emerald-400/5 text-2xl font-semibold text-emerald-400">
            92
          </div>
          <div>
            <p className="font-medium">Healthy foundation</p>
            <p className="mt-1 text-xs leading-5 text-base-content/50">
              184 pages crawled · updated today
            </p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <HealthRow label="Critical" count={2} tone="error" />
          <HealthRow label="Warnings" count={5} tone="warning" />
          <HealthRow label="Passed checks" count={47} tone="success" />
        </div>
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          className="btn btn-sm w-full"
        >
          Review all issues <ArrowRight className="size-4" />
        </Link>
      </div>
    </OverviewPanel>
  );
}

function HealthRow({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: keyof typeof healthRowStyles;
}) {
  const styles = healthRowStyles[tone];
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${styles.background}`}
    >
      <span className="flex items-center gap-2">
        <Icon className={`size-4 ${styles.icon}`} /> {label}
      </span>
      <b className="tabular-nums">{count}</b>
    </div>
  );
}

function AcquisitionPanel() {
  return (
    <OverviewPanel title="Acquisition mix" eyebrow="Web analytics">
      <div className="flex items-center gap-3 p-5">
        <div className="h-44 min-w-0 flex-1">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 192, height: 176 }}
          >
            <PieChart>
              <Pie
                data={channelShare}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={3}
                stroke="none"
              >
                {channelShare.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip content={<OverviewChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2.5">
          {channelShare.map((item) => (
            <div
              key={item.name}
              className="flex min-w-28 items-center justify-between gap-4 text-xs"
            >
              <span className="flex items-center gap-2 text-base-content/55">
                <i
                  className="size-2 rounded-full"
                  style={{ background: item.color }}
                />
                {item.name}
              </span>
              <b>{item.value}%</b>
            </div>
          ))}
        </div>
      </div>
    </OverviewPanel>
  );
}

function LinkAuthorityPanel({ projectId }: { projectId: string }) {
  return (
    <OverviewPanel title="Link authority" eyebrow="Backlink profile">
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-base-200 p-3">
            <Link2 className="size-4 text-indigo-400" />
            <p className="mt-4 text-2xl font-semibold">4,836</p>
            <p className="text-xs text-base-content/45">Backlinks</p>
          </div>
          <div className="rounded-xl bg-base-200 p-3">
            <Globe2 className="size-4 text-cyan-400" />
            <p className="mt-4 text-2xl font-semibold">312</p>
            <p className="text-xs text-base-content/45">Ref. domains</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-base-300 pt-4 text-sm">
          <span className="text-base-content/55">Authority score</span>
          <span className="flex items-center gap-2 font-semibold">
            <span className="size-2 rounded-full bg-emerald-400" /> 61 / 100
          </span>
        </div>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{ target: "dgtl.lk", scope: "domain" }}
          className="btn btn-ghost btn-sm mt-3 w-full"
        >
          Explore backlinks <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </OverviewPanel>
  );
}

function OpportunitiesPanel({ projectId }: { projectId: string }) {
  return (
    <OverviewPanel
      title="Quick-win opportunities"
      eyebrow="Action center"
      action={<Target className="size-4 text-primary" />}
    >
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Position</th>
              <th>Volume</th>
              <th>Intent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {opportunities.map((item) => (
              <tr key={item.keyword}>
                <td className="font-medium">{item.keyword}</td>
                <td>
                  <span className="badge badge-sm badge-warning">
                    #{item.position}
                  </span>
                </td>
                <td className="tabular-nums">{item.volume}</td>
                <td className="text-base-content/55">{item.intent}</td>
                <td>
                  <Link
                    to="/p/$projectId/keywords"
                    params={{ projectId }}
                    search={{ q: item.keyword }}
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={`Research ${item.keyword}`}
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OverviewPanel>
  );
}

function VisitorBehaviorPanel({ projectId }: { projectId: string }) {
  return (
    <OverviewPanel title="Visitor behavior" eyebrow="Microsoft Clarity">
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-base-200 p-3">
            <MousePointerClick className="size-4 text-rose-400" />
            <p className="mt-3 text-2xl font-semibold">126</p>
            <p className="text-xs text-base-content/45">Rage clicks</p>
          </div>
          <div className="rounded-xl bg-base-200 p-3">
            <Flame className="size-4 text-orange-400" />
            <p className="mt-3 text-2xl font-semibold">68%</p>
            <p className="text-xs text-base-content/45">Avg. scroll depth</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/8 p-3 text-xs leading-5 text-base-content/65">
          Pricing and contact pages show the highest hesitation. Review mobile
          recordings first.
        </div>
        <Link
          to="/p/$projectId/clarity"
          params={{ projectId }}
          className="btn btn-sm w-full"
        >
          Open behavior insights <ArrowRight className="size-4" />
        </Link>
      </div>
    </OverviewPanel>
  );
}
