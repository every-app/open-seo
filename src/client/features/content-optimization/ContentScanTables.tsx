import type { OnPageReport } from "@/serverFunctions/contentOptimization";
import {
  buildBenchmarksSectionText,
  buildCompetitorTermsSectionText,
} from "./agentBrief";
import { SectionCopyButton } from "./SectionCopyButton";

// ─── Benchmarks ──────────────────────────────────────────────────────────────

const BENCHMARK_ROWS = [
  { key: "word_count", label: "Words" },
  { key: "h1_count", label: "H1" },
  { key: "h2_count", label: "H2" },
  { key: "h3_count", label: "H3" },
  { key: "image_count", label: "Images" },
  { key: "entity_count", label: "Entities" },
  { key: "keyword_variation_count", label: "Keyword variations" },
] as const;

function PairedBars({
  yours,
  versus,
}: {
  yours: number | null;
  versus: number | null;
}) {
  const max = Math.max(yours ?? 0, versus ?? 0);
  const width = (v: number | null) =>
    max > 0 && v !== null && v > 0 ? Math.max((v / max) * 100, 2) : 0;
  return (
    <div className="w-full min-w-24 space-y-1">
      <div className="h-2 overflow-hidden rounded-[3px] bg-base-200">
        <div
          className="h-full rounded-[3px] bg-primary"
          style={{ width: `${width(yours)}%` }}
        />
      </div>
      <div className="h-2 overflow-hidden rounded-[3px] bg-base-200">
        <div
          className="h-full rounded-[3px] bg-base-content/30"
          style={{ width: `${width(versus)}%` }}
        />
      </div>
    </div>
  );
}

export function BenchmarksCard({ report }: { report: OnPageReport }) {
  const { your_url, page1_average } = report.benchmarks;
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Structure vs page-1 average</h2>
          <div className="flex items-center gap-3 text-xs text-base-content/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-primary" /> your page
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: "#4a4a52" }}
              />{" "}
              page-1 average
            </span>
            <SectionCopyButton
              getText={() => buildBenchmarksSectionText(report)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex border-b border-base-300 pb-2">
              <span className="w-36 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/40">
                Metric
              </span>
              {BENCHMARK_ROWS.map((row) => (
                <span
                  key={row.key}
                  className="flex-1 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-base-content/40"
                >
                  {row.label}
                </span>
              ))}
            </div>
            <div className="flex border-b border-base-300 py-3">
              <span className="w-36 shrink-0 text-sm text-base-content/60">
                Page-1 avg
              </span>
              {BENCHMARK_ROWS.map((row) => (
                <span
                  key={row.key}
                  className="flex-1 text-right font-mono text-[17px] tabular-nums text-base-content/50"
                >
                  {formatCount(page1_average[row.key])}
                </span>
              ))}
            </div>
            <div className="flex py-3">
              <span className="w-36 shrink-0 text-sm font-semibold">Yours</span>
              {BENCHMARK_ROWS.map((row) => {
                const yours = your_url[row.key];
                const avg = page1_average[row.key];
                const below = yours !== null && avg !== null && yours < avg;
                return (
                  <span
                    key={row.key}
                    className="flex-1 text-right font-mono text-[17px] font-semibold tabular-nums"
                    style={below ? { color: "#d9a94a" } : undefined}
                  >
                    {formatCount(yours)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Competitor terms ────────────────────────────────────────────────────────

export function CompetitorTermsCard({ report }: { report: OnPageReport }) {
  const { terms } = report.competitor_term_coverage;
  if (terms.length === 0) return null;
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Competitor term coverage</h2>
          <div className="flex items-center gap-4 text-xs text-base-content/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-primary" /> your count
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-base-content/30" />{" "}
              competitor avg
            </span>
            <SectionCopyButton
              getText={() => buildCompetitorTermsSectionText(report)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <tbody>
              {terms.map((term) => {
                const avg = average(term.competitor_counts);
                const behind = avg !== null && term.your_url_count < avg;
                return (
                  <tr key={term.keyword} className="border-base-200">
                    <td className="w-44 text-xs text-base-content/80">
                      {term.keyword}
                    </td>
                    <td>
                      <PairedBars yours={term.your_url_count} versus={avg} />
                    </td>
                    <td className="w-24 text-right font-mono text-xs tabular-nums">
                      <span style={behind ? { color: "#d9a94a" } : undefined}>
                        {term.your_url_count}
                      </span>
                      <span className="text-base-content/40">
                        {" "}
                        / {avg === null ? "—" : avg.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatCount(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
