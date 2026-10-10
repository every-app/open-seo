import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { sort } from "remeda";
import { safeHostname } from "@/shared/safe-url";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { BingConnectionRepository } from "@/server/features/bing/repositories/BingConnectionRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";

export type DashboardActivation = {
  domain: string | null;
  ga4: {
    connected: boolean;
    propertyDisplayName: string | null;
    cardDismissedAt: string | null;
  };
  gsc: { connected: boolean; siteUrl: string | null };
  bing: { connected: boolean; siteUrl: string | null };
  mcp: {
    authorizedAt: string | null;
    firstToolCallAt: string | null;
    cardDismissedAt: string | null;
  };
  competitorClickedAt: string | null;
  keywordsClickedAt: string | null;
  hasAudit: boolean;
  hasMultipleProjects: boolean;
  hasTeammate: boolean;
  dismissedSteps: string[];
};

export type DashboardAuditSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  pagesCrawled: number;
  // The crawl's page limit; small sites finish below it.
  pagesTotal: number;
  startedAt: string;
  // Top issue types by severity then affected-page count, for the card's list.
  topIssues: {
    issueType: string;
    severity: "critical" | "warning" | "info";
    count: number;
  }[];
};

type DashboardOverview = { audit: DashboardAuditSummary | null };

async function getActivation(input: {
  userId: string;
  projectId: string;
  organizationId: string;
  domain: string | null;
}): Promise<DashboardActivation> {
  const [
    ga4,
    gsc,
    bing,
    orgActivation,
    projectActivation,
    projectCount,
    hasTeammate,
    dismissed,
    latestAudit,
  ] = await Promise.all([
    Ga4ConnectionRepository.getByProjectId(input.projectId),
    GscConnectionRepository.getByProjectId(input.projectId),
    BingConnectionRepository.getByProjectId(input.projectId),
    ActivationRepository.getOrganizationActivation(input.organizationId),
    ActivationRepository.getProjectActivation(input.projectId),
    ProjectRepository.countProjects(input.organizationId),
    ActivationRepository.hasTeammate(input.organizationId),
    ActivationRepository.getDismissedSteps(input.userId, input.projectId),
    AuditRepository.getLatestAuditForProject(input.projectId),
  ]);

  return {
    domain: input.domain,
    hasMultipleProjects: projectCount > 1,
    hasTeammate,
    dismissedSteps: dismissed.map((row) => row.step),
    ga4: {
      connected: ga4 !== null,
      propertyDisplayName: ga4?.propertyDisplayName ?? null,
      cardDismissedAt: projectActivation?.ga4CardDismissedAt ?? null,
    },
    gsc: { connected: gsc !== null, siteUrl: gsc?.siteUrl ?? null },
    bing: { connected: bing !== null, siteUrl: bing?.siteUrl ?? null },
    mcp: {
      authorizedAt: orgActivation?.firstMcpAuthorizedAt ?? null,
      firstToolCallAt: orgActivation?.firstMcpToolCallAt ?? null,
      cardDismissedAt: projectActivation?.mcpCardDismissedAt ?? null,
    },
    competitorClickedAt: projectActivation?.competitorStepClickedAt ?? null,
    keywordsClickedAt: projectActivation?.keywordStepClickedAt ?? null,
    hasAudit: latestAudit != null,
  };
}

async function getOverview(input: {
  projectId: string;
  domain: string | null;
}): Promise<DashboardOverview> {
  return { audit: await getAuditSummary(input.projectId, input.domain) };
}

async function getAuditSummary(
  projectId: string,
  domain: string | null,
): Promise<DashboardAuditSummary | null> {
  const hostname = domain ? safeHostname(`https://${domain}`) : null;
  if (!hostname) return null;

  const audits = await AuditRepository.getAuditsByProject(projectId);
  const audit = audits.find(
    (candidate) => safeHostname(candidate.startUrl) === hostname,
  );
  if (!audit) return null;

  const typeRows = await getIssueTypePageCountsForAudit(audit.id);

  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sorted = sort(
    typeRows.map((row) => ({
      issueType: row.issueType,
      severity: row.severity,
      count: row.pages,
    })),
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || b.count - a.count,
  );

  return {
    id: audit.id,
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    pagesTotal: audit.pagesTotal,
    startedAt: audit.startedAt,
    topIssues: sorted.slice(0, 3),
  };
}

export const DashboardService = {
  setStepDismissed: ActivationRepository.setStepDismissed,
  getActivation,
  getOverview,
};
