import { useMemo } from "react";
import { StatCard } from "@/client/features/audit/shared";
import {
  exportPages,
  exportPerformance,
} from "@/client/features/audit/results/export";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  ExportDropdown,
  isLighthouseFailure,
  PagesTable,
  PerformanceTable,
} from "@/client/features/audit/results/ResultsTables";

type SearchSetter = (updates: Record<string, string | undefined>) => void;

export function ResultsView({
  projectId,
  data,
  tab,
  setSearchParams,
}: {
  projectId: string;
  data: AuditResultsData;
  tab: string;
  setSearchParams: SearchSetter;
}) {
  const { audit, pages, lighthouse } = data;
  const hasPerformanceTab = lighthouse.length > 0;
  const activeTab = hasPerformanceTab ? tab : "pages";
  const stats = useResultStats(pages, lighthouse);

  return (
    <>
      <StatsGrid
        pagesCrawled={audit.pagesCrawled}
        totalPages={pages.length}
        totalLighthouse={lighthouse.length}
        averageResponseMs={stats.averageResponseMs}
        lighthouseSummary={stats.lighthouseSummary}
      />

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <ResultsHeader
            pageCount={pages.length}
            lighthouseCount={lighthouse.length}
            hasPerformanceTab={hasPerformanceTab}
            activeTab={activeTab}
            setSearchParams={setSearchParams}
            onExport={(format) => {
              if (activeTab === "performance") {
                exportPerformance(lighthouse, pages, format);
                return;
              }
              exportPages(pages, format);
            }}
          />

          {activeTab === "pages" && <PagesTable pages={pages} />}
          {activeTab === "performance" && lighthouse.length > 0 && (
            <PerformanceTable
              auditId={audit.id}
              projectId={projectId}
              lighthouse={lighthouse}
              pages={pages}
            />
          )}
        </div>
      </div>
    </>
  );
}

function useResultStats(
  pages: AuditResultsData["pages"],
  lighthouse: AuditResultsData["lighthouse"],
) {
  const averageResponseMs = useMemo(() => {
    if (pages.length === 0) return 0;
    const total = pages.reduce(
      (sum: number, page: AuditResultsData["pages"][number]) =>
        sum + (page.responseTimeMs ?? 0),
      0,
    );
    return Math.round(total / pages.length);
  }, [pages]);

  const lighthouseSummary = useMemo(() => {
    const failed = lighthouse.filter(
      (row: AuditResultsData["lighthouse"][number]) => isLighthouseFailure(row),
    ).length;
    const successful = lighthouse.filter(
      (row: AuditResultsData["lighthouse"][number]) =>
        !isLighthouseFailure(row),
    );
    const averageScore = (
      key: "performanceScore" | "seoScore" | "accessibilityScore",
    ) => {
      const values = successful
        .map((row: AuditResultsData["lighthouse"][number]) => row[key])
        .filter((value: number | null): value is number => value != null);
      if (values.length === 0) return null;
      const total = values.reduce((sum: number, value) => sum + value, 0);
      return Math.round(total / values.length);
    };

    return {
      failed,
      avgPerformance: averageScore("performanceScore"),
      avgSeo: averageScore("seoScore"),
      avgAccessibility: averageScore("accessibilityScore"),
    };
  }, [lighthouse]);

  return { averageResponseMs, lighthouseSummary };
}

function ResultsHeader({
  pageCount,
  lighthouseCount,
  hasPerformanceTab,
  activeTab,
  setSearchParams,
  onExport,
}: {
  pageCount: number;
  lighthouseCount: number;
  hasPerformanceTab: boolean;
  activeTab: string;
  setSearchParams: SearchSetter;
  onExport: (format: "csv" | "json") => void;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      {hasPerformanceTab ? (
        <div role="tablist" className="tabs tabs-box w-fit">
          <button
            role="tab"
            className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
            onClick={() => setSearchParams({ tab: "pages" })}
          >
            Pages ({pageCount})
          </button>
          <button
            role="tab"
            className={`tab ${activeTab === "performance" ? "tab-active" : ""}`}
            onClick={() => setSearchParams({ tab: "performance" })}
          >
            Performance ({lighthouseCount})
          </button>
        </div>
      ) : (
        <h3 className="text-base font-medium">Pages ({pageCount})</h3>
      )}

      <ExportDropdown onExport={onExport} />
    </div>
  );
}

function StatsGrid({
  pagesCrawled,
  totalPages,
  totalLighthouse,
  averageResponseMs,
  lighthouseSummary,
}: {
  pagesCrawled: number;
  totalPages: number;
  totalLighthouse: number;
  averageResponseMs: number;
  lighthouseSummary: {
    failed: number;
    avgPerformance: number | null;
    avgSeo: number | null;
    avgAccessibility: number | null;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Pages Crawled" value={String(pagesCrawled)} />
      <StatCard label="Total URLs" value={String(totalPages)} />
      <StatCard label="Lighthouse Tests" value={String(totalLighthouse)} />
      <StatCard label="Avg Response" value={`${averageResponseMs}ms`} />
      {totalLighthouse > 0 && (
        <>
          <StatCard
            label="Avg Lighthouse Perf"
            value={
              lighthouseSummary.avgPerformance == null
                ? "-"
                : String(lighthouseSummary.avgPerformance)
            }
            className={scoreClass(lighthouseSummary.avgPerformance)}
          />
          <StatCard
            label="Avg Lighthouse SEO"
            value={
              lighthouseSummary.avgSeo == null
                ? "-"
                : String(lighthouseSummary.avgSeo)
            }
            className={scoreClass(lighthouseSummary.avgSeo)}
          />
          <StatCard
            label="Avg Lighthouse A11y"
            value={
              lighthouseSummary.avgAccessibility == null
                ? "-"
                : String(lighthouseSummary.avgAccessibility)
            }
            className={scoreClass(lighthouseSummary.avgAccessibility)}
          />
          <StatCard
            label="Lighthouse Failures"
            value={String(lighthouseSummary.failed)}
            className={
              lighthouseSummary.failed > 0 ? "text-error" : "text-success"
            }
          />
        </>
      )}
    </div>
  );
}

function scoreClass(score: number | null) {
  if (score == null) return "";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}
