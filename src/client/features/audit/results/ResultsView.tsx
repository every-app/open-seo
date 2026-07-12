import { useMemo, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import {
  exportIssues,
  exportPages,
  exportPerformance,
} from "@/client/features/audit/results/export";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { isLighthouseFailure } from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import {
  IssuesView,
  resolveIssueSeverity,
} from "@/client/features/audit/results/IssuesView";
import { PagesTable } from "@/client/features/audit/results/PagesTable";
import {
  ExportDropdown,
  PerformanceTable,
} from "@/client/features/audit/results/ResultsTables";

type ResultsTab = "issues" | "pages" | "performance";

export function ResultsView({
  projectId,
  data,
  onTabChange,
  tab,
}: {
  projectId: string;
  data: AuditResultsData;
  tab: string;
  onTabChange: (tab: ResultsTab) => void;
}) {
  const { audit, pages, lighthouse, issues } = data;
  const hasPerformanceTab = lighthouse.length > 0;
  const activeTab =
    tab === "performance" && !hasPerformanceTab ? "issues" : tab;
  const stats = useResultStats(pages, lighthouse);
  const blockedCount = useMemo(
    () => pages.filter((page) => page.fetchClass === "blocked").length,
    [pages],
  );

  return (
    <>
      {blockedCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <span className="font-medium">
              We were blocked on {blockedCount}{" "}
              {blockedCount === 1 ? "page" : "pages"}.
            </span>{" "}
            <span className="text-base-content/70">
              The site's bot protection challenged our crawler, so those pages
              couldn't be audited. If this is your site, allowlist the{" "}
              <code className="font-mono">OpenSEO-Audit</code> user agent in
              your WAF or bot-protection settings and re-run the audit.
            </span>
          </p>
        </div>
      )}

      <StatsStrip
        pagesCrawled={audit.pagesCrawled}
        issues={issues}
        totalLighthouse={lighthouse.length}
        averageResponseMs={stats.averageResponseMs}
        lighthouseSummary={stats.lighthouseSummary}
      />

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <ResultsHeader
            issueCount={issues.length}
            pageCount={pages.length}
            lighthouseCount={lighthouse.length}
            hasPerformanceTab={hasPerformanceTab}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onExport={(format) => {
              if (activeTab === "performance") {
                exportPerformance(lighthouse, pages, format);
                return;
              }
              if (activeTab === "issues") {
                exportIssues(issues, format);
                return;
              }
              exportPages(pages, format);
            }}
          />

          {activeTab === "issues" && <IssuesView issues={issues} />}
          {activeTab === "pages" && (
            <PagesTable
              pages={pages}
              startUrl={audit.startUrl}
              issues={issues}
            />
          )}
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
  issueCount,
  pageCount,
  lighthouseCount,
  hasPerformanceTab,
  activeTab,
  onTabChange,
  onExport,
}: {
  issueCount: number;
  pageCount: number;
  lighthouseCount: number;
  hasPerformanceTab: boolean;
  activeTab: string;
  onTabChange: (tab: ResultsTab) => void;
  onExport: (format: "csv" | "json" | "sheets") => void;
}) {
  const tabs: Array<{ tab: ResultsTab; label: string }> = [
    { tab: "issues", label: `Issues (${issueCount})` },
    { tab: "pages", label: `Pages (${pageCount})` },
    ...(hasPerformanceTab
      ? [
          {
            tab: "performance" as const,
            label: `Performance (${lighthouseCount})`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div role="tablist" className="tabs tabs-border w-fit">
        {tabs.map(({ label, tab }) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tab ${isActive ? "tab-active" : ""}`}
              onClick={() => onTabChange(tab)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <ExportDropdown onExport={onExport} />
    </div>
  );
}

interface StatItem {
  label: string;
  value: string;
  valueClass?: string;
  sub?: ReactNode;
}

function StatsStrip({
  pagesCrawled,
  issues,
  totalLighthouse,
  averageResponseMs,
  lighthouseSummary,
}: {
  pagesCrawled: number;
  issues: AuditResultsData["issues"];
  totalLighthouse: number;
  averageResponseMs: number;
  lighthouseSummary: {
    failed: number;
    avgPerformance: number | null;
    avgSeo: number | null;
    avgAccessibility: number | null;
  };
}) {
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const issue of issues) {
      counts[resolveIssueSeverity(issue)] += 1;
    }
    return counts;
  }, [issues]);

  const items: StatItem[] = [
    { label: "Pages crawled", value: String(pagesCrawled) },
    {
      label: "Issues found",
      value: String(issues.length),
      valueClass: issues.length === 0 ? "text-success" : "",
      sub: issues.length > 0 && (
        <span className="flex items-center gap-2.5">
          <SeverityCount count={severityCounts.critical} dotClass="bg-error" />
          <SeverityCount count={severityCounts.warning} dotClass="bg-warning" />
          <SeverityCount
            count={severityCounts.info}
            dotClass="bg-base-content/30"
          />
        </span>
      ),
    },
    { label: "Avg response", value: `${averageResponseMs}ms` },
  ];

  if (totalLighthouse > 0) {
    items.push(
      { label: "Lighthouse tests", value: String(totalLighthouse) },
      {
        label: "Avg Lighthouse perf",
        value:
          lighthouseSummary.avgPerformance == null
            ? "-"
            : String(lighthouseSummary.avgPerformance),
        valueClass: scoreClass(lighthouseSummary.avgPerformance),
      },
      {
        label: "Avg Lighthouse SEO",
        value:
          lighthouseSummary.avgSeo == null
            ? "-"
            : String(lighthouseSummary.avgSeo),
        valueClass: scoreClass(lighthouseSummary.avgSeo),
      },
      {
        label: "Avg Lighthouse a11y",
        value:
          lighthouseSummary.avgAccessibility == null
            ? "-"
            : String(lighthouseSummary.avgAccessibility),
        valueClass: scoreClass(lighthouseSummary.avgAccessibility),
      },
      {
        label: "Lighthouse failures",
        value: String(lighthouseSummary.failed),
        valueClass:
          lighthouseSummary.failed > 0 ? "text-error" : "text-success",
      },
    );
  }

  const columnsClass =
    items.length === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-2 md:grid-cols-4";

  return (
    <div
      className={`grid ${columnsClass} gap-px rounded-lg border border-base-300 bg-base-300/70 overflow-hidden`}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-base-100 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-base-content/50">
            {item.label}
          </p>
          <p
            className={`text-xl font-semibold mt-0.5 tabular-nums ${item.valueClass ?? ""}`}
          >
            {item.value}
          </p>
          {item.sub && (
            <div className="text-xs text-base-content/60 mt-1">{item.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SeverityCount({
  count,
  dotClass,
}: {
  count: number;
  dotClass: string;
}) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1 tabular-nums">
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {count}
    </span>
  );
}

function scoreClass(score: number | null) {
  if (score == null) return "";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}
