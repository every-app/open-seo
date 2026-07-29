import {
  CWV_THRESHOLDS,
  formatCls,
  formatMs,
  metricTone,
  type ScoreTone,
  type SnapshotWithPrevious,
} from "@/shared/pagespeed";

/** The latest run for one URL: Lighthouse lab metrics beside the CrUX field
 *  data. Field data is what Google scores ranking on, so it gets equal
 *  billing and an explicit empty state rather than being hidden when absent. */
export function PagespeedRunDetail({
  url,
  entry,
}: {
  url: string;
  entry: SnapshotWithPrevious | undefined;
}) {
  const snapshot = entry?.snapshot;

  if (!snapshot) {
    return (
      <section className="rounded-xl border border-base-300 bg-base-100 p-4 text-sm text-base-content/60 shadow-sm">
        No results for <span className="font-mono text-xs">{url}</span> yet. Run
        it to see scores and Core Web Vitals.
      </section>
    );
  }

  if (snapshot.errorMessage) {
    return (
      <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Last run failed</h2>
        <p className="mt-1 text-sm text-error">{snapshot.errorMessage}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Lab results</h2>
        <p className="mb-3 text-xs text-base-content/55">
          A single synthetic run from Google's test environment.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="LCP" value={formatMs(snapshot.lcpMs)} />
          <Metric label="CLS" value={formatCls(snapshot.cls)} />
          <Metric label="TBT" value={formatMs(snapshot.tbtMs)} />
          <Metric label="FCP" value={formatMs(snapshot.fcpMs)} />
          <Metric label="Speed Index" value={formatMs(snapshot.speedIndexMs)} />
          <Metric label="TTFB" value={formatMs(snapshot.ttfbMs)} />
        </div>
      </section>

      <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">
          Field data
          {snapshot.fieldSource === "origin" ? (
            <span className="badge badge-ghost badge-sm ml-2">origin-wide</span>
          ) : null}
        </h2>
        <p className="mb-3 text-xs text-base-content/55">
          {snapshot.fieldSource === "origin"
            ? "Google has no data for this exact URL, so these are numbers for the whole site."
            : "Real Chrome users over the last 28 days. This is what Google scores."}
        </p>
        {snapshot.fieldOverallCategory ? (
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="LCP"
              value={formatMs(snapshot.fieldLcpMs)}
              tone={metricTone(snapshot.fieldLcpMs, CWV_THRESHOLDS.lcpMs)}
            />
            <Metric
              label="INP"
              value={formatMs(snapshot.fieldInpMs)}
              tone={metricTone(snapshot.fieldInpMs, CWV_THRESHOLDS.inpMs)}
            />
            <Metric
              label="CLS"
              value={formatCls(snapshot.fieldCls)}
              tone={metricTone(snapshot.fieldCls, CWV_THRESHOLDS.cls)}
            />
          </div>
        ) : (
          <p className="text-sm text-base-content/60">
            Google has no field data for this URL — it needs more real-user
            traffic before Core Web Vitals appear.
          </p>
        )}
      </section>
    </div>
  );
}

const TONE_CLASS: Record<ScoreTone, string> = {
  good: "text-success",
  average: "text-warning",
  poor: "text-error",
  none: "",
};

function Metric({
  label,
  value,
  tone = "none",
}: {
  label: string;
  value: string;
  tone?: ScoreTone;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
        {value}
      </p>
    </div>
  );
}
