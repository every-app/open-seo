import { useMemo } from "react";
import { StatCard } from "@/client/features/audit/shared";
import {
  exportPages,
  exportPerformance,
} from "@/client/features/audit/results/export";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import {
  ExportDropdown,
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
  const { audit, pages, psi } = data;
  const hasPerformanceTab = psi.length > 0;
  const activeTab = hasPerformanceTab ? tab : "pages";
  const stats = useResultStats(pages, psi);

  return (
    <>
      <StatsGrid
        pagesCrawled={audit.pagesCrawled}
        totalPages={pages.length}
        totalPsi={psi.length}
        averageResponseMs={stats.averageResponseMs}
        psiSummary={stats.psiSummary}
      />

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <ResultsHeader
            pageCount={pages.length}
            psiCount={psi.length}
            hasPerformanceTab={hasPerformanceTab}
            activeTab={activeTab}
            setSearchParams={setSearchParams}
            onExport={(format) => {
              if (activeTab === "performance") {
                exportPerformance(psi, pages, format);
                return;
              }
              exportPages(pages, format);
            }}
          />

          {activeTab === "pages" && <PagesTable pages={pages} />}
          {activeTab === "performance" && psi.length > 0 && (
            <PerformanceTable projectId={projectId} psi={psi} pages={pages} />
          )}
        </div>
      </div>
    </>
  );
}

function useResultStats(
  pages: AuditResultsData["pages"],
  psi: AuditResultsData["psi"],
) {
  const averageResponseMs = useMemo(() => {
    if (pages.length === 0) return 0;
    const total = pages.reduce(
      (sum, page) => sum + (page.responseTimeMs ?? 0),
      0,
    );
    return Math.round(total / pages.length);
  }, [pages]);

  const psiSummary = useMemo(() => {
    const failed = psi.filter((row) => !!row.errorMessage).length;
    const successful = psi.filter((row) => !row.errorMessage);
    const averageScore = (
      key: "performanceScore" | "seoScore" | "accessibilityScore",
    ) => {
      const values = successful
        .map((row) => row[key])
        .filter((value): value is number => value != null);
      if (values.length === 0) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      return Math.round(total / values.length);
    };

    return {
      failed,
      avgPerformance: averageScore("performanceScore"),
      avgSeo: averageScore("seoScore"),
      avgAccessibility: averageScore("accessibilityScore"),
    };
  }, [psi]);

  return { averageResponseMs, psiSummary };
}

function ResultsHeader({
  pageCount,
  psiCount,
  hasPerformanceTab,
  activeTab,
  setSearchParams,
  onExport,
}: {
  pageCount: number;
  psiCount: number;
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
            Performance ({psiCount})
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
  totalPsi,
  averageResponseMs,
  psiSummary,
}: {
  pagesCrawled: number;
  totalPages: number;
  totalPsi: number;
  averageResponseMs: number;
  psiSummary: {
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
      <StatCard label="PSI Tests" value={String(totalPsi)} />
      <StatCard label="Avg Response" value={`${averageResponseMs}ms`} />
      {totalPsi > 0 && (
        <>
          <StatCard
            label="Avg PSI Perf"
            value={
              psiSummary.avgPerformance == null
                ? "-"
                : String(psiSummary.avgPerformance)
            }
            className={scoreClass(psiSummary.avgPerformance)}
          />
          <StatCard
            label="Avg PSI SEO"
            value={psiSummary.avgSeo == null ? "-" : String(psiSummary.avgSeo)}
            className={scoreClass(psiSummary.avgSeo)}
          />
          <StatCard
            label="Avg PSI A11y"
            value={
              psiSummary.avgAccessibility == null
                ? "-"
                : String(psiSummary.avgAccessibility)
            }
            className={scoreClass(psiSummary.avgAccessibility)}
          />
          <StatCard
            label="PSI Failures"
            value={String(psiSummary.failed)}
            className={psiSummary.failed > 0 ? "text-error" : "text-success"}
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
