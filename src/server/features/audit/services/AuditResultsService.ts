import type { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  getAuditResultsSummary,
  listAuditIssues,
  listAuditPages,
} from "@/server/features/audit/repositories/auditResultsQueries";
import { AppError } from "@/server/lib/errors";
import { parseAuditConfig } from "@/server/lib/audit/types";
import type { PageFetchClass } from "@/shared/audit-fetch-class";
import type {
  getAuditIssuesSchema,
  getAuditPagesSchema,
} from "@/types/schemas/audit";

async function requireAudit(auditId: string, projectId: string) {
  const audit = await AuditRepository.getAuditForProject(auditId, projectId);
  if (!audit) throw new AppError("NOT_FOUND");
  return audit;
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The host most of the site's real (2xx) pages live on, so the pages table
 * can drop it from paths. The start URL's host is only a fallback: audits
 * often start from the apex domain of a site that canonicalizes to www.
 */
function predominantHost(urls: string[], startUrl: string) {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const host = hostnameOf(url);
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  let best = hostnameOf(startUrl);
  let bestCount = 0;
  for (const [host, hostCount] of counts) {
    if (hostCount > bestCount) {
      best = host;
      bestCount = hostCount;
    }
  }
  return best;
}

/** Everything the results page shows outside the paged tables. */
async function getSummary(auditId: string, projectId: string) {
  const audit = await requireAudit(auditId, projectId);
  const config = parseAuditConfig(audit.config);
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Invalid audit configuration");
  }

  const { issueGroups, fetchClassRows, lighthouse, okPageUrls } =
    await getAuditResultsSummary(auditId);

  const fetchClassCounts: Record<PageFetchClass, number> = {
    ok: 0,
    blocked: 0,
    rate_limited: 0,
    error: 0,
  };
  let pageCount = 0;
  let totalResponseMs = 0;
  for (const row of fetchClassRows) {
    fetchClassCounts[row.fetchClass] += row.count;
    pageCount += row.count;
    totalResponseMs += row.totalResponseMs;
  }

  // One group per issue type; a type always carries one severity, but the
  // query groups by both, so fold any stray split back together.
  const groups = new Map<
    string,
    { issueType: string; severity: string; count: number }
  >();
  for (const row of issueGroups) {
    const group = groups.get(row.issueType);
    if (group) group.count += row.count;
    else groups.set(row.issueType, { ...row });
  }

  return {
    audit: {
      id: audit.id,
      startUrl: audit.startUrl,
      status: audit.status,
      pagesCrawled: audit.pagesCrawled,
      pagesTotal: audit.pagesTotal,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      config,
    },
    pageCount,
    issueCount: issueGroups.reduce((sum, row) => sum + row.count, 0),
    issueGroups: Array.from(groups.values()),
    fetchClassCounts,
    averageResponseMs:
      pageCount > 0 ? Math.round(totalResponseMs / pageCount) : 0,
    canonicalHost: predominantHost(
      okPageUrls.map((row) => row.url),
      audit.startUrl,
    ),
    lighthouse,
  };
}

async function getPages(
  input: Omit<z.output<typeof getAuditPagesSchema>, "projectId">,
  projectId: string,
) {
  const { auditId, ...params } = input;
  await requireAudit(auditId, projectId);
  return listAuditPages(auditId, params);
}

async function getIssues(
  input: Omit<z.output<typeof getAuditIssuesSchema>, "projectId">,
  projectId: string,
) {
  const { auditId, ...params } = input;
  await requireAudit(auditId, projectId);
  return listAuditIssues(auditId, params);
}

export const AuditResultsService = {
  getSummary,
  getPages,
  getIssues,
} as const;
