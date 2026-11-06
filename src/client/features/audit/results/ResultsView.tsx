import { MetricsTable } from "@/client/components/MetricsTable";
import { useMemo, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import {
  exportIssues,
  exportPages,
  exportPerformance,
} from "@/client/features/audit/results/export";
import type {
  AuditLighthouseRow,
  AuditResultsData,
} from "@/client/features/audit/results/types";
import { isLighthouseFailure } from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import {
  IssuesView,
  resolveIssueSeverity,
} from "@/client/features/audit/results/IssuesView";
import { PagesTable } from "@/client/features/audit/results/PagesTable";
import { ShopifyCrawlWarning } from "@/client/features/audit/results/ShopifyCrawlWarning";
import { RenderingWarnings } from "@/client/features/audit/results/RenderingWarnings";
import { PerformanceTable } from "@/client/features/audit/results/ResultsTables";
import {
  BotProtectionAdvice,
  SCORE_TEXT_CLASS,
  scoreTone,
  SeverityBadge,
} from "@/client/features/audit/shared";
import { ExportMenu } from "@/client/components/ExportMenu";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { TabsTrigger } from "@/client/components/ui/tabs";

type ResultsTab = "issues" | "pages" | "performance";

export function ResultsView({
  projectId,
  data,
  onTabChange,
  tab,
  siteBlocked,
}: {
  projectId: string;
  data: AuditResultsData;
  tab: string;
  onTabChange: (tab: ResultsTab) => void;
  /** The page already says bot protection blocked the whole site. */
  siteBlocked: boolean;
}) {
  const { audit, lighthouse, issueGroups } = data;
  const auditRef = { projectId, auditId: audit.id };
  const crawlStopped = issueGroups.some(
    (group) => group.issueType === "crawl-rate-limited",
  );
  const hasPerformanceTab = lighthouse.length > 0;
  const activeTab =
    tab === "performance" && !hasPerformanceTab ? "issues" : tab;
  const lighthouseSummary = useLighthouseSummary(lighthouse);
  const blockedCount = data.fetchClassCounts.blocked;
  const rateLimitedCount = data.fetchClassCounts.rate_limited;

  // Shopify stores get their own notice instead of the generic advice.
  const shopifyLimited =
    audit.config.sitePlatform === "shopify" &&
    (blockedCount > 0 || rateLimitedCount > 0 || crawlStopped);

  const tabs = (
    <ResultsHeader
      issueCount={data.issueCount}
      pageCount={data.pageCount}
      lighthouseCount={lighthouse.length}
      hasPerformanceTab={hasPerformanceTab}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onExport={(format) => {
        if (activeTab === "performance") {
          exportPerformance(lighthouse, format);
          return;
        }
        if (activeTab === "issues") {
          exportIssues(auditRef, format);
          return;
        }
        exportPages(auditRef, format);
      }}
    />
  );

  return (
    <>
      {shopifyLimited && (
        <ShopifyCrawlWarning
          projectId={projectId}
          audit={audit}
          throttled={rateLimitedCount > 0 || crawlStopped}
        />
      )}

      {!shopifyLimited && !siteBlocked && blockedCount > 0 && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>
            Bot protection blocked our crawler on {blockedCount}{" "}
            {blockedCount === 1 ? "page" : "pages"}.
          </AlertTitle>
          <AlertDescription>
            <BotProtectionAdvice
              projectId={projectId}
              rendered={audit.config.renderJavaScript === true}
            />
          </AlertDescription>
        </Alert>
      )}

      {!shopifyLimited && (rateLimitedCount > 0 || crawlStopped) && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>
            {crawlStopped
              ? "The crawl stopped early because of the site’s rate limit."
              : `The site rate limited us on ${rateLimitedCount} ${rateLimitedCount === 1 ? "page" : "pages"}.`}
          </AlertTitle>
          <AlertDescription>
            {crawlStopped
              ? "The site kept refusing pages, so some URLs were left unvisited. This report is incomplete. "
              : "Pages that returned 429 Too Many Requests could not be audited. "}
            Re-run the audit after the rate limit resets, or ask the site owner
            to allow the{" "}
            <a
              className="underline underline-offset-4"
              href="https://openseo.so/docs/crawler"
              target="_blank"
              rel="noreferrer"
            >
              OpenSEO-Audit crawler
            </a>
            .
          </AlertDescription>
        </Alert>
      )}

      <RenderingWarnings data={data} />

      <StatsStrip
        pagesCrawled={audit.pagesCrawled}
        issueCount={data.issueCount}
        issueGroups={issueGroups}
        totalLighthouse={lighthouse.length}
        averageResponseMs={data.averageResponseMs}
        lighthouseSummary={lighthouseSummary}
      />

      {activeTab === "issues" && (
        <IssuesView auditRef={auditRef} issueGroups={issueGroups} tabs={tabs} />
      )}
      {activeTab === "pages" && (
        <PagesTable
          auditRef={auditRef}
          canonicalHost={data.canonicalHost}
          totalCount={data.pageCount}
          tabs={tabs}
        />
      )}
      {activeTab === "performance" && (
        <PerformanceTable
          auditId={audit.id}
          projectId={projectId}
          lighthouse={lighthouse}
          tabs={tabs}
        />
      )}
    </>
  );
}

function useLighthouseSummary(lighthouse: AuditLighthouseRow[]) {
  return useMemo(() => {
    const failed = lighthouse.filter((row) => isLighthouseFailure(row)).length;
    const successful = lighthouse.filter((row) => !isLighthouseFailure(row));
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
  }, [lighthouse]);
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
    <DataTableTabs
      value={activeTab}
      onValueChange={(value) => {
        const next = tabs.find((item) => item.tab === value);
        if (next) onTabChange(next.tab);
      }}
      actions={
        <ExportMenu actions={["sheets", "csv", "json"]} onExport={onExport} />
      }
    >
      {tabs.map(({ label, tab }) => (
        <TabsTrigger key={tab} value={tab}>
          {label}
        </TabsTrigger>
      ))}
    </DataTableTabs>
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
  issueCount,
  issueGroups,
  totalLighthouse,
  averageResponseMs,
  lighthouseSummary,
}: {
  pagesCrawled: number;
  issueCount: number;
  issueGroups: AuditResultsData["issueGroups"];
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
    for (const group of issueGroups) {
      counts[resolveIssueSeverity(group)] += group.count;
    }
    return counts;
  }, [issueGroups]);

  const items: StatItem[] = [
    { label: "Pages crawled", value: String(pagesCrawled) },
    {
      label: "Issues found",
      value: String(issueCount),
      valueClass: issueCount === 0 ? "text-success" : "",
      sub: issueCount > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {(["critical", "warning", "info"] as const).map((severity) =>
            severityCounts[severity] > 0 ? (
              <SeverityBadge
                key={severity}
                severity={severity}
                title={severity}
              >
                {severity === "critical"
                  ? "Critical"
                  : severity === "warning"
                    ? "Warning"
                    : "Info"}{" "}
                {severityCounts[severity]}
              </SeverityBadge>
            ) : null,
          )}
        </span>
      ),
    },
    { label: "Average response time", value: `${averageResponseMs}ms` },
  ];

  if (totalLighthouse > 0) {
    items.push(
      { label: "Lighthouse tests", value: String(totalLighthouse) },
      {
        label: "Lighthouse performance",
        value:
          lighthouseSummary.avgPerformance == null
            ? "-"
            : String(lighthouseSummary.avgPerformance),
        valueClass: scoreClass(lighthouseSummary.avgPerformance),
      },
      {
        label: "Lighthouse SEO",
        value:
          lighthouseSummary.avgSeo == null
            ? "-"
            : String(lighthouseSummary.avgSeo),
        valueClass: scoreClass(lighthouseSummary.avgSeo),
      },
      {
        label: "Lighthouse accessibility",
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
          lighthouseSummary.failed > 0 ? "text-destructive" : "text-success",
      },
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-card p-3">
      <MetricsTable
        rows={items.map((item) => ({
          label: (
            <div className="flex flex-wrap items-center gap-2">
              {item.label}
              {item.sub || null}
            </div>
          ),
          value: <span className={item.valueClass}>{item.value}</span>,
        }))}
      />
    </div>
  );
}

function scoreClass(score: number | null) {
  const tone = scoreTone(score);
  return tone ? SCORE_TEXT_CLASS[tone] : "";
}
