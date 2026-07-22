import { useMemo } from "react";
import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import type { OnPageReport } from "@/serverFunctions/contentOptimization";
import { buildAgentBrief, buildEntitySectionText } from "./agentBrief";
import { SectionCopyButton } from "./SectionCopyButton";
import { InternalLinksCard, SuggestionsCard } from "./ContentScanSuggestions";
import { BenchmarksCard, CompetitorTermsCard } from "./ContentScanTables";
import {
  buildWorklistEntities,
  EntityWorklist,
  STATUS_COLORS,
} from "./EntityWorklist";
import { PageClassificationCard } from "./PageClassificationCard";

export function ContentScanReport({
  report,
  pageCategory,
}: {
  report: OnPageReport;
  pageCategory: string | null;
}) {
  const worklist = useMemo(
    () => buildWorklistEntities(report.entity_coverage),
    [report.entity_coverage],
  );
  return (
    <div className="space-y-[22px]">
      <ScoreHero report={report} pageCategory={pageCategory} />
      <BenchmarksCard report={report} />
      <CoveragePanel report={report} entityCount={worklist.length} />
      <EntityWorklist entities={worklist} />
      <VariationsPanel report={report} />
      <CompetitorTermsCard report={report} />
      <PageClassificationCard report={report} pageCategory={pageCategory} />
      <SuggestionsCard report={report} />
      <InternalLinksCard report={report} />
      <p className="text-right text-xs text-base-content/40">
        Powered by On-Page.ai
      </p>
    </div>
  );
}

// ─── Score hero ──────────────────────────────────────────────────────────────

const GRADE_BANDS = ["Poor", "Fair", "Good", "Great"];

function bandForScore(score: number): number {
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  if (score >= 40) return 1;
  return 0;
}

function ScoreHero({
  report,
  pageCategory,
}: {
  report: OnPageReport;
  pageCategory: string | null;
}) {
  const opt = report.on_page_optimization;
  const score = opt.score;
  const band = score === null ? -1 : bandForScore(score);
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body grid items-center gap-6 p-6 lg:grid-cols-[310px_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[48px] font-bold leading-none tabular-nums">
              {score ?? "—"}
            </span>
            <span className="text-lg text-base-content/40">/ 100</span>
            <span
              className="rounded-[3px] border px-2.5 py-1 text-[13px] font-semibold"
              style={{
                color: STATUS_COLORS.good,
                backgroundColor: "rgba(63,185,80,0.12)",
                borderColor: "rgba(63,185,80,0.28)",
              }}
            >
              {opt.grade}
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-base-content/10">
              <div
                className="h-full rounded-[3px]"
                style={{
                  width: `${score ?? 0}%`,
                  background: "linear-gradient(90deg,#3f7bcf,#6a9bff)",
                }}
              />
            </div>
            <div className="flex justify-between">
              {GRADE_BANDS.map((label, index) => (
                <span
                  key={label}
                  className={`text-[10.5px] uppercase tracking-[0.08em] ${
                    index === band
                      ? "font-semibold text-base-content/80"
                      : "text-base-content/40"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-[16px] leading-relaxed text-base-content/80">
            {opt.summary}
          </p>
          <div>
            <button
              type="button"
              className="btn btn-sm gap-1.5"
              onClick={() => {
                void navigator.clipboard.writeText(
                  buildAgentBrief(report, pageCategory),
                );
                toast.success("Agent brief copied. Paste it into your agent.");
              }}
            >
              <ClipboardCopy className="size-3.5" />
              Copy agent brief
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Entity coverage + density panel ─────────────────────────────────────────

function CoveragePanel({
  report,
  entityCount,
}: {
  report: OnPageReport;
  entityCount: number;
}) {
  const coverage = report.entity_coverage;
  const counts = useMemo(() => {
    const all = [
      ...coverage.natural_language_entities,
      ...coverage.highly_related_terms,
      ...coverage.keyword_variations.map((v) => ({
        coverage_status: v.coverage_status,
      })),
    ];
    return {
      good: all.filter((e) => e.coverage_status === "good").length,
      weak: all.filter((e) => e.coverage_status === "present_not_entity")
        .length,
      missing: all.filter((e) => e.coverage_status === "missing").length,
    };
  }, [coverage]);
  const total = counts.good + counts.weak + counts.missing;

  const yours = coverage.your_url_related_entity_density_score;
  const competitor = coverage.competitor_related_entity_density_score;
  const scaleMax = Math.max(yours ?? 0, competitor ?? 0) * 1.15 || 1;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Entity coverage</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-base-content/50">
              {entityCount} entities tracked
            </span>
            <SectionCopyButton getText={() => buildEntitySectionText(report)} />
          </div>
        </div>

        {total > 0 && (
          <div className="space-y-3">
            <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-[3px]">
              <div
                className="rounded-l-[3px]"
                style={{
                  width: `${(counts.good / total) * 100}%`,
                  backgroundColor: STATUS_COLORS.good,
                }}
              />
              <div
                style={{
                  width: `${(counts.weak / total) * 100}%`,
                  backgroundColor: STATUS_COLORS.present_not_entity,
                }}
              />
              <div
                className="rounded-r-[3px]"
                style={{
                  width: `${(counts.missing / total) * 100}%`,
                  backgroundColor: STATUS_COLORS.missing,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-6 text-[13.5px] text-base-content/70">
              <LegendCount
                color={STATUS_COLORS.good}
                count={counts.good}
                label="covered"
              />
              <LegendCount
                color={STATUS_COLORS.present_not_entity}
                count={counts.weak}
                label="found but needs context"
              />
              <LegendCount
                color={STATUS_COLORS.missing}
                count={counts.missing}
                label="missing"
              />
            </div>
          </div>
        )}

        {(yours !== null || competitor !== null) && (
          <>
            <div className="h-px w-full bg-base-300" />
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/50">
                Related entity density
              </p>
              <div className="flex items-end gap-3">
                <span className="w-28 shrink-0 pb-1 text-[13.5px] text-base-content/70">
                  Your page
                </span>
                <div className="relative h-[42px] flex-1">
                  {competitor !== null && (
                    <span
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.06em]"
                      style={{
                        left: `${Math.min(Math.max((competitor / scaleMax) * 100, 10), 90)}%`,
                        color: "#e0938c",
                      }}
                    >
                      Competitor avg · {competitor.toFixed(0)}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-1 h-3 rounded-[3px] bg-base-content/10">
                    <div
                      className="h-full rounded-[3px] bg-primary"
                      style={{ width: `${((yours ?? 0) / scaleMax) * 100}%` }}
                    />
                  </div>
                  {competitor !== null && (
                    <div
                      className="absolute bottom-0 h-5 w-[2px]"
                      style={{
                        left: `${(competitor / scaleMax) * 100}%`,
                        backgroundColor: STATUS_COLORS.missing,
                      }}
                    />
                  )}
                </div>
                <span className="w-12 shrink-0 pb-1 text-right text-[15px] font-semibold tabular-nums">
                  {yours === null ? "—" : yours.toFixed(0)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegendCount({
  color,
  count,
  label,
}: {
  color: string;
  count: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-semibold text-base-content">{count}</span> {label}
    </span>
  );
}

// ─── Keyword variations ──────────────────────────────────────────────────────

function VariationsPanel({ report }: { report: OnPageReport }) {
  const variations = report.entity_coverage.keyword_variations;
  if (variations.length === 0) return null;
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/50">
          Keyword variations
        </p>
        <div className="flex flex-wrap gap-2">
          {variations.map((variation) => (
            <span
              key={variation.variation}
              className="inline-flex items-center gap-2 rounded-[3px] border border-base-300 bg-base-200/60 px-3.5 py-1.5 text-[13.5px]"
            >
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor:
                    STATUS_COLORS[variation.coverage_status] ?? "#6a6a72",
                }}
              />
              {variation.variation}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
