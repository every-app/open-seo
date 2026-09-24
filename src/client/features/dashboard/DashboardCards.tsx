import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
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
      title="Search performance"
      stamp="Google Search Console, last 28 days"
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          More details
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
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load Search Console data. Try again shortly.
        </p>
      ) : report?.connected ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Clicks"
            value={formatCount(report.totals.clicks)}
            sub={
              <PercentDelta
                current={report.totals.clicks}
                previous={report.prevTotals.clicks}
              />
            }
          />
          <Stat
            label="Impressions"
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
            label="Avg position"
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
      <CardShell title="Site audit">
        <EmptyCardBody
          message="Crawl your site for broken links, missing tags and indexability problems."
          cta={
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className="btn btn-primary btn-sm"
            >
              Run an audit
            </Link>
          }
        />
      </CardShell>
    );
  }

  return (
    <CardShell
      title="Site audit"
      stamp={
        audit.status === "completed"
          ? `Crawled ${audit.pagesCrawled.toLocaleString()} pages on ${formatDay(audit.startedAt)}`
          : audit.status === "running"
            ? "Crawl in progress"
            : "The last crawl failed"
      }
      action={
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          Open audit
        </Link>
      }
    >
      {audit.topIssues.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-success" />
          No issues found — your site looks healthy.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Pages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.topIssues.map((issue) => (
                <TableRow key={issue.issueType}>
                  <TableCell className="font-medium">
                    {issueTitles[issue.issueType] ?? issue.issueType}
                  </TableCell>
                  <TableCell>
                    <Badge variant={severityBadge[issue.severity].variant}>
                      {severityBadge[issue.severity].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {issue.count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-sm text-muted-foreground">
            {criticalSummary(audit)}
          </p>
        </>
      )}
    </CardShell>
  );
}

// Top issues arrive sorted critical-first, so the critical count is exact
// once a non-critical issue appears in the list (or the list is complete).
function criticalSummary(audit: DashboardAuditSummary): string {
  const critical = audit.topIssues.filter(
    (issue) => issue.severity === "critical",
  ).length;
  const exact =
    critical < audit.topIssues.length ||
    audit.totalIssueTypes === audit.topIssues.length;
  const types =
    audit.totalIssueTypes === 1 ? "issue type is" : "issue types are";
  return `${exact ? "" : "At least "}${critical} of ${audit.totalIssueTypes} ${types} critical.`;
}

const severityBadge = {
  critical: { label: "Critical", variant: "destructive" },
  warning: { label: "Warning", variant: "warning" },
  info: { label: "Info", variant: "secondary" },
} as const;

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
      <CardShell title="Backlink changes" stamp="Taking your first snapshot…">
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
      <CardShell title="Backlink changes">
        <p className="text-sm text-muted-foreground">
          We&rsquo;ll snapshot who links to your domain — nothing to set up.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell
      title="Backlink changes"
      stamp={`Snapshot from ${formatDay(backlinks.capturedAt)}${
        refreshing ? ", refreshing…" : ""
      }`}
      action={
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{ target: backlinks.domain, scope: "domain" }}
          className={moreDetailsClass}
        >
          Open backlinks
        </Link>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Links</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">New</TableHead>
            <TableHead className="text-right">Lost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <BacklinkRow
            label="Backlinks"
            total={backlinks.backlinks}
            gained={backlinks.newBacklinks}
            lost={backlinks.lostBacklinks}
          />
          <BacklinkRow
            label="Referring domains"
            total={backlinks.referringDomains}
            gained={backlinks.newReferringDomains}
            lost={backlinks.lostReferringDomains}
          />
        </TableBody>
      </Table>
    </CardShell>
  );
}

function BacklinkRow({
  label,
  total,
  gained,
  lost,
}: {
  label: string;
  total: number | null;
  gained: number | null;
  lost: number | null;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right tabular-nums">
        {total === null ? "—" : total.toLocaleString()}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${gained ? "text-success" : ""}`}
      >
        {gained ? `+${gained.toLocaleString()}` : newLost(gained)}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${lost ? "text-error" : ""}`}
      >
        {lost ? `−${lost.toLocaleString()}` : newLost(lost)}
      </TableCell>
    </TableRow>
  );
}
