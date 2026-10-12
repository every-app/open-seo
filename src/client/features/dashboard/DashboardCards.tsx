import { GoogleSearchConsoleLogo } from "@/client/features/integrations/GoogleProductLogos";
import { startAudit } from "@/serverFunctions/audit";
import { QueryError } from "@/client/components/QueryState";
import { LoaderCircle, ScanSearch } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { Progress } from "@/client/components/ui/progress";
import { Button } from "@/client/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { SeverityBadge } from "@/client/features/audit/shared";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";

import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  formatDay,
  moreDetailsClass,
  MetricsTableSkeleton,
} from "@/client/features/dashboard/cardParts";
import { percentChange } from "@/client/components/MetricsTable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { DashboardAuditSummary } from "@/server/features/dashboard/services/DashboardService";

// Plain string-keyed view of the registry: issue types from the DB are not
// statically guaranteed to be registry keys.
const issueTitles: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(AUDIT_ISSUE_TYPES).map(([key, value]) => [key, value.title]),
);

export function GscCard({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const reportQuery = useQuery({
    queryKey: ["dashboardGscReport", projectId, siteUrl],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    enabled: connected,
    staleTime: 10 * 60_000,
  });
  const report = reportQuery.data;

  // Not connected (or a dead grant discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (report && !report.connected)) {
    return (
      <div id="connect-gsc">
        <GoogleConnectionCard provider="gsc" projectId={projectId} prominent />
      </div>
    );
  }

  return (
    <CardShell
      title="Google Search Console Performance"
      icon={<GoogleSearchConsoleLogo className="size-5" />}
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          View GSC insights →
        </Link>
      }
    >
      <p className="mb-4 text-sm font-medium text-muted-foreground">
        Last 28 days
      </p>
      {reportQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Search Console data. Try again shortly.
        </p>
      ) : !report ? (
        <MetricsTableSkeleton />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              {
                label: "Clicks",
                value: formatCount(report.totals.clicks),
                change: percentChange(
                  report.totals.clicks,
                  report.prevTotals.clicks,
                ),
              },
              {
                label: "Impressions",
                value: formatCount(report.totals.impressions),
                change: percentChange(
                  report.totals.impressions,
                  report.prevTotals.impressions,
                ),
              },
              {
                label: "Click-through rate",
                value: formatCtr(report.totals.ctr),
                change: null,
              },
              {
                label: "Average position",
                value: formatPosition(report.totals.position),
                change: null,
              },
            ].map((metric) => (
              <TableRow key={metric.label}>
                <TableCell>{metric.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {metric.value}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${metric.change === null || metric.change === 0 ? "text-muted-foreground" : metric.change > 0 ? "text-success" : "text-destructive"}`}
                >
                  {metric.change === null
                    ? "—"
                    : `${metric.change > 0 ? "+" : ""}${metric.change}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardShell>
  );
}

export function AuditHealthCard({
  projectId,
  audit,
  domain,
}: {
  projectId: string;
  audit: DashboardAuditSummary | null;
  domain: string | null;
}) {
  const queryClient = useQueryClient();
  const scan = useMutation({
    mutationFn: () =>
      startAudit({
        data: {
          projectId,
          startUrl: `https://${domain}`,
          maxPages: 50,
          renderJavaScript: true,
        },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["dashboardOverview", projectId],
      }),
    meta: { errorToast: false },
  });
  if (!audit)
    return (
      <CardShell title="Site health">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <ScanSearch className="size-7 text-muted-foreground" />
          <h3 className="font-medium">Find what's holding your website back</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Scan up to 50 pages for broken links, missing titles and pages
            Google can't index.
          </p>
          {domain ? (
            <Button disabled={scan.isPending} onClick={() => scan.mutate()}>
              {scan.isPending ? "Starting scan…" : "Scan my website"}
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={
                <Link to="/p/$projectId/settings" params={{ projectId }} />
              }
            >
              Add your website
            </Button>
          )}
          {scan.isError && (
            <QueryError
              error={scan.error}
              fallback="Could not start your scan"
            />
          )}
        </div>
      </CardShell>
    );

  if (audit.status === "running")
    // A running crawl has at most a partial issue list, and an empty one is
    // not the same as a healthy site, so show progress instead.
    return (
      <CardShell
        title="Site health"
        action={
          <Link
            to="/p/$projectId/audit"
            params={{ projectId }}
            search={{ auditId: audit.id }}
            className={moreDetailsClass}
          >
            View progress
          </Link>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
          <h3 className="font-medium">Scanning your website</h3>
          <Progress
            className="w-full max-w-xs"
            value={audit.pagesCrawled}
            max={audit.pagesTotal || 1}
            aria-label="Pages checked"
          />
          <p className="text-sm text-muted-foreground tabular-nums">
            {audit.pagesCrawled} of up to {audit.pagesTotal} pages checked
          </p>
        </div>
      </CardShell>
    );

  return (
    <CardShell
      title="Site health"
      action={
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          search={{ auditId: audit.id, tab: "issues" }}
          className={moreDetailsClass}
        >
          Review issues
        </Link>
      }
    >
      {audit.status === "failed" && (
        <p className="mb-4 text-sm text-destructive">
          The latest scan didn’t finish. Review the results or try again.
        </p>
      )}
      {audit.status === "completed" && (
        <p className="mb-4 text-sm text-muted-foreground">
          {audit.pagesCrawled} pages checked · {formatDay(audit.startedAt)}
        </p>
      )}
      {audit.topIssues.length === 0 ? (
        audit.status === "completed" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-success" />
            No issues found — your site looks healthy.
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run the audit again to see issues.
          </p>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issue</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="text-right">Pages affected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.topIssues.map((issue) => (
              <TableRow key={issue.issueType}>
                <TableCell>
                  {issueTitles[issue.issueType] ?? issue.issueType}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={issue.severity}>
                    {issue.severity === "critical"
                      ? "Critical"
                      : issue.severity === "warning"
                        ? "Warning"
                        : "Info"}
                  </SeverityBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {issue.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardShell>
  );
}
