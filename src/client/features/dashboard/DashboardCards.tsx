import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";

import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  CardShell,
  EmptyCardBody,
  formatDay,
  moreDetailsClass,
  newLost,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import type {
  DashboardAuditSummary,
  DashboardBacklinkSummary,
} from "@/server/features/dashboard/services/DashboardService";

// Plain string-keyed view of the registry: issue types from the DB are not
// statically guaranteed to be registry keys.
const issueTitles: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(AUDIT_ISSUE_TYPES).map(([key, value]) => [key, value.title]),
);

export function GscCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const reportQuery = useQuery({
    queryKey: ["dashboardGscReport", projectId],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    enabled: connected,
  });

  // Not connected (or a dead grant discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (reportQuery.data && !reportQuery.data.connected)) {
    return (
      <div id="connect-gsc">
        <SearchConsoleConnectionCard projectId={projectId} />
      </div>
    );
  }

  const report = reportQuery.data;

  return (
    <CardShell
      title="搜索表现"
      stamp="Google Search Console · 最近 28 天"
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          查看更多
        </Link>
      }
    >
      {reportQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : reportQuery.isError ? (
        <p className="text-sm text-base-content/60">
          无法加载 Search Console 数据，请稍后重试。
        </p>
      ) : report?.connected ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="点击次数"
            value={formatCount(report.totals.clicks)}
            sub={
              <PercentDelta
                current={report.totals.clicks}
                previous={report.prevTotals.clicks}
              />
            }
          />
          <Stat
            label="展示次数"
            value={formatCount(report.totals.impressions)}
            sub={
              <PercentDelta
                current={report.totals.impressions}
                previous={report.prevTotals.impressions}
              />
            }
          />
          <Stat label="CTR" value={formatCtr(report.totals.ctr)} />
          <Stat
            label="平均排名"
            value={formatPosition(report.totals.position)}
          />
        </div>
      ) : null}
    </CardShell>
  );
}

export function AuditHealthCard({
  projectId,
  audit,
}: {
  projectId: string;
  audit: DashboardAuditSummary | null;
}) {
  if (!audit) {
    return (
      <CardShell title="站点审计">
        <EmptyCardBody
          message="抓取网站，检查失效链接、缺失标签和索引问题。"
          cta={
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className="btn btn-primary btn-sm"
            >
              运行审计
            </Link>
          }
        />
      </CardShell>
    );
  }

  return (
    <CardShell
      title="站点审计"
      stamp={`站点审计 · ${
        audit.status === "completed"
          ? `已抓取 ${audit.pagesCrawled} 个页面 · ${formatDay(audit.startedAt)}`
          : audit.status === "running"
            ? "正在抓取"
            : "上次抓取失败"
      }`}
      action={
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          查看更多
        </Link>
      }
    >
      {audit.topIssues.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-base-content/70">
          <Check className="size-4 text-success" />
          未发现问题，网站状态良好。
        </div>
      ) : (
        <ul className="space-y-2">
          {audit.topIssues.map((issue) => (
            <li
              key={issue.issueType}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    issue.severity === "critical"
                      ? "bg-error"
                      : issue.severity === "warning"
                        ? "bg-warning"
                        : "bg-base-content/30"
                  }`}
                />
                <span className="truncate">
                  {issueTitles[issue.issueType] ?? issue.issueType}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-base-content/60">
                {issue.count} 个页面
              </span>
            </li>
          ))}
          {audit.totalIssueTypes > audit.topIssues.length ? (
            <li className="text-xs text-base-content/50">
              + {audit.totalIssueTypes - audit.topIssues.length} 个其他问题
            </li>
          ) : null}
        </ul>
      )}
    </CardShell>
  );
}

export function BacklinkPulseCard({
  projectId,
  backlinks,
  refreshing,
}: {
  projectId: string;
  backlinks: DashboardBacklinkSummary | null;
  refreshing: boolean;
}) {
  if (!backlinks && refreshing) {
    return (
      <CardShell title="反向链接动态" stamp="正在生成首次快照…">
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      </CardShell>
    );
  }

  if (!backlinks) {
    return (
      <CardShell title="反向链接动态">
        <p className="text-sm text-base-content/60">
          我们会记录链接到您域名的网站，无需额外设置。
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell
      title="反向链接动态"
      stamp={`反向链接 · 快照 ${formatDay(backlinks.capturedAt)}${
        refreshing ? "· 刷新中…" : ""
      }`}
      action={
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{ target: backlinks.domain, scope: "domain" }}
          className={moreDetailsClass}
        >
          查看更多
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="引用域名"
          value={
            backlinks.referringDomains === null
              ? "—"
              : backlinks.referringDomains.toLocaleString()
          }
        />
        <Stat
          label="反向链接"
          value={
            backlinks.backlinks === null
              ? "—"
              : backlinks.backlinks.toLocaleString()
          }
        />
        <Stat
          label="新增链接"
          value={`▲ ${newLost(backlinks.newBacklinks)}`}
          tone={
            backlinks.newBacklinks && backlinks.newBacklinks > 0
              ? "success"
              : undefined
          }
        />
        <Stat
          label="丢失链接"
          value={`▼ ${newLost(backlinks.lostBacklinks)}`}
          tone={
            backlinks.lostBacklinks && backlinks.lostBacklinks > 0
              ? "error"
              : undefined
          }
        />
      </div>
    </CardShell>
  );
}
