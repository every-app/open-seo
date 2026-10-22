import { identity, sortBy } from "remeda";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";

type AuditResults = Awaited<
  ReturnType<typeof AuditRepository.getAuditResultsForProject>
>;
type AuditIssue = AuditResults["issues"][number];
type AuditPage = AuditResults["pages"][number];
type AuditLighthouse = AuditResults["lighthouse"][number];

export type CompareKpis = {
  pagesCrawled: number;
  issuesTotal: number;
  issuesCritical: number;
  issuesWarning: number;
  issuesInfo: number;
  averageResponseMs: number;
  lighthouseTests: number;
  lighthouseFailures: number;
  avgPerformance: number | null;
  avgSeo: number | null;
  avgAccessibility: number | null;
};

export type CompareIssueChange = "new" | "resolved" | "persistent";

export type CompareIssueGroup = {
  issueType: string;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  howToFix: string;
  change: CompareIssueChange;
  previousCount: number;
  latestCount: number;
  delta: number;
  urls: string[];
};

export type CompareAuditMeta = {
  id: string;
  startUrl: string;
  status: string;
  pagesCrawled: number;
  startedAt: string;
  completedAt: string | null;
};

export type CompareLatestAuditsResult =
  | {
      ok: true;
      previous: CompareAuditMeta;
      latest: CompareAuditMeta;
      previousKpis: CompareKpis;
      latestKpis: CompareKpis;
      issueGroups: CompareIssueGroup[];
      summary: {
        newCount: number;
        resolvedCount: number;
        persistentCount: number;
      };
    }
  | {
      ok: false;
      reason: "need_two_completed";
      completedCount: number;
    };

function resolveSeverity(issue: {
  issueType: string;
  severity: string;
}): IssueSeverity {
  const descriptor = getIssueDescriptor(issue.issueType);
  if (descriptor) return descriptor.severity;
  return issue.severity === "critical" || issue.severity === "warning"
    ? issue.severity
    : "info";
}

function issueKey(issue: AuditIssue): string {
  // Broken-link rows can share type+URL but differ by target in detailsJson.
  const details = issue.detailsJson ?? "";
  return `${issue.issueType}\0${issue.pageUrl}\0${details}`;
}

function isLighthouseFailure(row: AuditLighthouse): boolean {
  if (row.errorMessage) return true;
  return (
    row.performanceScore == null &&
    row.accessibilityScore == null &&
    row.bestPracticesScore == null &&
    row.seoScore == null
  );
}

function averageScore(
  rows: AuditLighthouse[],
  key: "performanceScore" | "seoScore" | "accessibilityScore",
): number | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => value != null);
  if (values.length === 0) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function computeKpis(
  pagesCrawled: number,
  pages: AuditPage[],
  issues: AuditIssue[],
  lighthouse: AuditLighthouse[],
): CompareKpis {
  const severityCounts = { critical: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    severityCounts[resolveSeverity(issue)] += 1;
  }

  const averageResponseMs =
    pages.length === 0
      ? 0
      : Math.round(
          pages.reduce((sum, page) => sum + (page.responseTimeMs ?? 0), 0) /
            pages.length,
        );

  const failed = lighthouse.filter((row) => isLighthouseFailure(row)).length;
  const successful = lighthouse.filter((row) => !isLighthouseFailure(row));

  return {
    pagesCrawled,
    issuesTotal: issues.length,
    issuesCritical: severityCounts.critical,
    issuesWarning: severityCounts.warning,
    issuesInfo: severityCounts.info,
    averageResponseMs,
    lighthouseTests: lighthouse.length,
    lighthouseFailures: failed,
    avgPerformance: averageScore(successful, "performanceScore"),
    avgSeo: averageScore(successful, "seoScore"),
    avgAccessibility: averageScore(successful, "accessibilityScore"),
  };
}

function toMeta(audit: NonNullable<AuditResults["audit"]>): CompareAuditMeta {
  return {
    id: audit.id,
    startUrl: audit.startUrl,
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    startedAt: audit.startedAt,
    completedAt: audit.completedAt,
  };
}

function buildIssueGroups(
  previousIssues: AuditIssue[],
  latestIssues: AuditIssue[],
): CompareIssueGroup[] {
  const previousByKey = new Map(
    previousIssues.map((issue) => [issueKey(issue), issue]),
  );
  const latestByKey = new Map(
    latestIssues.map((issue) => [issueKey(issue), issue]),
  );

  type Acc = {
    issueType: string;
    severity: IssueSeverity;
    title: string;
    explanation: string;
    howToFix: string;
    previousKeys: Set<string>;
    latestKeys: Set<string>;
    previousUrls: Set<string>;
    latestUrls: Set<string>;
  };

  const byType = new Map<string, Acc>();

  const ensure = (issue: AuditIssue): Acc => {
    let acc = byType.get(issue.issueType);
    if (!acc) {
      const descriptor = getIssueDescriptor(issue.issueType);
      acc = {
        issueType: issue.issueType,
        severity: resolveSeverity(issue),
        title: descriptor?.title ?? issue.issueType,
        explanation: descriptor?.explanation ?? "",
        howToFix: descriptor?.howToFix ?? "",
        previousKeys: new Set(),
        latestKeys: new Set(),
        previousUrls: new Set(),
        latestUrls: new Set(),
      };
      byType.set(issue.issueType, acc);
    }
    return acc;
  };

  for (const [key, issue] of previousByKey) {
    const acc = ensure(issue);
    acc.previousKeys.add(key);
    acc.previousUrls.add(issue.pageUrl);
  }
  for (const [key, issue] of latestByKey) {
    const acc = ensure(issue);
    acc.latestKeys.add(key);
    acc.latestUrls.add(issue.pageUrl);
  }

  const groups: CompareIssueGroup[] = [];

  for (const acc of byType.values()) {
    const previousCount = acc.previousKeys.size;
    const latestCount = acc.latestKeys.size;
    const delta = latestCount - previousCount;

    let change: CompareIssueChange;
    if (previousCount === 0 && latestCount > 0) change = "new";
    else if (previousCount > 0 && latestCount === 0) change = "resolved";
    else change = "persistent";

    const urls =
      change === "resolved"
        ? sortBy(Array.from(acc.previousUrls), identity())
        : change === "new"
          ? sortBy(Array.from(acc.latestUrls), identity())
          : sortBy(
              Array.from(new Set([...acc.previousUrls, ...acc.latestUrls])),
              identity(),
            );

    groups.push({
      issueType: acc.issueType,
      severity: acc.severity,
      title: acc.title,
      explanation: acc.explanation,
      howToFix: acc.howToFix,
      change,
      previousCount,
      latestCount,
      delta,
      urls,
    });
  }

  const changeOrder: Record<CompareIssueChange, number> = {
    new: 0,
    persistent: 1,
    resolved: 2,
  };

  return sortBy(
    groups,
    [(group) => changeOrder[group.change], "asc"],
    [(group) => ISSUE_SEVERITY_ORDER[group.severity], "asc"],
    [(group) => Math.abs(group.delta), "desc"],
    [(group) => group.latestCount, "desc"],
  );
}

async function compareLatestAudits(
  projectId: string,
): Promise<CompareLatestAuditsResult> {
  const audits = await AuditRepository.getAuditsByProject(projectId);
  const completed = audits.filter((audit) => audit.status === "completed");

  if (completed.length < 2) {
    return {
      ok: false,
      reason: "need_two_completed",
      completedCount: completed.length,
    };
  }

  const latestAudit = completed[0]!;
  const previousAudit = completed[1]!;

  const [latestResults, previousResults] = await Promise.all([
    AuditRepository.getAuditResultsForProject(latestAudit.id, projectId),
    AuditRepository.getAuditResultsForProject(previousAudit.id, projectId),
  ]);

  if (!latestResults.audit || !previousResults.audit) {
    return {
      ok: false,
      reason: "need_two_completed",
      completedCount: completed.length,
    };
  }

  const issueGroups = buildIssueGroups(
    previousResults.issues,
    latestResults.issues,
  );

  return {
    ok: true,
    previous: toMeta(previousResults.audit),
    latest: toMeta(latestResults.audit),
    previousKpis: computeKpis(
      previousResults.audit.pagesCrawled,
      previousResults.pages,
      previousResults.issues,
      previousResults.lighthouse,
    ),
    latestKpis: computeKpis(
      latestResults.audit.pagesCrawled,
      latestResults.pages,
      latestResults.issues,
      latestResults.lighthouse,
    ),
    issueGroups,
    summary: {
      newCount: issueGroups.filter((group) => group.change === "new").length,
      resolvedCount: issueGroups.filter((group) => group.change === "resolved")
        .length,
      persistentCount: issueGroups.filter(
        (group) => group.change === "persistent",
      ).length,
    },
  };
}

export const AuditCompareService = {
  compareLatestAudits,
} as const;
