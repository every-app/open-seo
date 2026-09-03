import { ExternalUrlCell } from "@/client/components/table/url";
import type {
  ClarityInsightsData,
  ClarityPageInsight,
} from "@/client/features/clarity/clarityInsightsTypes";

function integer(value: number | null): string {
  return value == null ? "—" : Math.round(value).toLocaleString();
}

function decimal(value: number | null, digits = 1): string {
  return value == null
    ? "—"
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function percent(value: number | null): string {
  return value == null ? "—" : `${decimal(value)}%`;
}

function duration(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${decimal(value)}s`;
  const minutes = Math.floor(value / 60);
  return `${minutes}m ${Math.round(value % 60)}s`;
}

function SummaryMetric({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 px-4 py-4">
      <dt className="text-xs font-medium text-base-content/55">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {help ? (
        <p className="mt-1 text-xs text-base-content/45">{help}</p>
      ) : null}
    </div>
  );
}

export function ClaritySummary({ data }: { data: ClarityInsightsData }) {
  const { traffic, engagement, scrollDepthPercent } = data.overview;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryMetric label="Sessions" value={integer(traffic.sessions)} />
      <SummaryMetric
        label="Distinct users"
        value={integer(traffic.distinctUsers)}
      />
      <SummaryMetric
        label="Pages per session"
        value={decimal(traffic.pagesPerSession, 2)}
      />
      <SummaryMetric
        label="Bot sessions"
        value={integer(traffic.botSessions)}
      />
      <SummaryMetric
        label="Average active time"
        value={duration(engagement.averageActiveTimeSeconds)}
        help="Average seconds with active interaction"
      />
      <SummaryMetric
        label="Average total time"
        value={duration(engagement.averageTotalTimeSeconds)}
      />
      <SummaryMetric
        label="Active time"
        value={percent(engagement.activeTimePercent)}
        help="Active time as a share of total time"
      />
      <SummaryMetric
        label="Average scroll depth"
        value={percent(scrollDepthPercent)}
      />
    </dl>
  );
}

const FRICTION_ITEMS = [
  ["deadClicks", "Dead clicks"],
  ["excessiveScrolls", "Excessive scrolls"],
  ["rageClicks", "Rage clicks"],
  ["quickBacks", "Quick backs"],
  ["scriptErrors", "Script errors"],
  ["errorClicks", "Error clicks"],
] as const;

export function ClarityFriction({ data }: { data: ClarityInsightsData }) {
  return (
    <section className="space-y-3" aria-labelledby="clarity-friction-heading">
      <div>
        <h2 id="clarity-friction-heading" className="text-lg font-semibold">
          Interaction friction
        </h2>
        <p className="text-sm text-base-content/60">
          Aggregate signals that can point to confusing or broken experiences.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FRICTION_ITEMS.map(([key, label]) => {
          const metric = data.overview.friction[key];
          return (
            <div
              key={key}
              className="rounded-xl border border-base-300 bg-base-100 px-4 py-3.5"
            >
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="mt-2 flex items-end justify-between gap-3">
                <span className="text-2xl font-semibold tabular-nums">
                  {integer(metric.count)}
                </span>
                <span className="text-xs tabular-nums text-base-content/55">
                  {percent(metric.sessionsWithMetricPercent)} of sessions
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function frictionCount(
  row: ClarityPageInsight,
  key: keyof ClarityPageInsight["friction"],
) {
  return integer(row.friction[key].count);
}

export function ClarityPagesTable({ rows }: { rows: ClarityPageInsight[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm min-w-[1180px]">
        <caption className="sr-only">
          Microsoft Clarity behavior and friction metrics grouped by page URL
        </caption>
        <thead>
          <tr>
            <th>Page</th>
            <th className="text-right">Sessions</th>
            <th className="text-right">Users</th>
            <th className="text-right">Active</th>
            <th className="text-right">Scroll</th>
            <th className="text-right">Dead</th>
            <th className="text-right">Rage</th>
            <th className="text-right">Quick backs</th>
            <th className="text-right">Excess scroll</th>
            <th className="text-right">Script errors</th>
            <th className="text-right">Error clicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={11}
                className="py-10 text-center text-base-content/50"
              >
                No URL-level metrics were returned for this period.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.url}-${index}`}>
                <td className="max-w-sm" data-ph-mask>
                  <ExternalUrlCell value={row.url} display="path" />
                  {row.privacyVariant ? (
                    <span className="mt-0.5 block text-xs text-base-content/45">
                      Redacted URL variant {row.privacyVariant.index} of{" "}
                      {row.privacyVariant.count}
                    </span>
                  ) : null}
                </td>
                <td className="text-right tabular-nums">
                  {integer(row.traffic.sessions)}
                </td>
                <td className="text-right tabular-nums">
                  {integer(row.traffic.distinctUsers)}
                </td>
                <td className="text-right tabular-nums">
                  {percent(row.engagement.activeTimePercent)}
                </td>
                <td className="text-right tabular-nums">
                  {percent(row.scrollDepthPercent)}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "deadClicks")}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "rageClicks")}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "quickBacks")}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "excessiveScrolls")}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "scriptErrors")}
                </td>
                <td className="text-right tabular-nums">
                  {frictionCount(row, "errorClicks")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type NamedRow = { label: string | null; sessions: number | null };

function BreakdownCard({ title, rows }: { title: string; rows: NamedRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <h3 className="border-b border-base-300 px-4 py-3 text-sm font-semibold">
        {title}
      </h3>
      <div className="max-h-72 overflow-auto">
        <table className="table table-sm">
          <caption className="sr-only">
            Sessions by {title.toLowerCase()}
          </caption>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="text-base-content/45">No data</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.label ?? "unknown"}-${index}`}>
                  <td className="max-w-64 truncate" data-ph-mask>
                    {row.label ?? "Unknown"}
                  </td>
                  <td className="text-right tabular-nums">
                    {integer(row.sessions)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ClarityBreakdowns({ data }: { data: ClarityInsightsData }) {
  const { breakdowns } = data.overview;
  const popularRows = breakdowns.popularPages.map((row) => ({
    label: row.url,
    sessions: row.visits,
  }));
  return (
    <section className="space-y-3" aria-labelledby="clarity-breakdowns-heading">
      <div>
        <h2 id="clarity-breakdowns-heading" className="text-lg font-semibold">
          Audience and content breakdowns
        </h2>
        <p className="text-sm text-base-content/60">
          Top rows returned by Clarity for the selected UTC period.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BreakdownCard title="Browsers" rows={breakdowns.browsers} />
        <BreakdownCard title="Devices" rows={breakdowns.devices} />
        <BreakdownCard
          title="Operating systems"
          rows={breakdowns.operatingSystems}
        />
        <BreakdownCard title="Countries" rows={breakdowns.countries} />
        <BreakdownCard title="Page titles" rows={breakdowns.pageTitles} />
        <BreakdownCard title="Referrers" rows={breakdowns.referrers} />
        <BreakdownCard title="Popular pages" rows={popularRows} />
      </div>
    </section>
  );
}
