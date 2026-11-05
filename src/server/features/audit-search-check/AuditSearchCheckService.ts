import {
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { GSC_MAX_ROW_LIMIT } from "@/server/features/gsc/searchAnalytics";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { GscApiError, GscNotConnectedError } from "@/server/lib/gscErrors";
import { AuditSearchCheckQueries } from "@/server/features/audit-search-check/auditSearchCheckQueries";
import {
  findSearchIssues,
  type InspectedUrl,
  trimNotCrawled,
  type SearchConsolePageRow,
  type TrackedRankingUrl,
} from "@/server/features/audit-search-check/searchCheckRules";
import {
  DEFAULT_DATE_RANGE,
  DEFAULT_MAX_INSPECTIONS,
  DEFAULT_MAX_NOT_CRAWLED_SHOWN,
  DEFAULT_MIN_IMPRESSIONS,
} from "@/server/features/audit-search-check/searchCheckThresholds";
import type {
  AuditSearchCheck,
  AuditSearchCheckInput,
} from "@/types/schemas/auditSearchCheck";

type SearchConsoleData = {
  rows: SearchConsolePageRow[];
  window: { startDate: string; endDate: string };
};

function emptyResult(notes: string[], auditId: string | null = null) {
  return {
    findings: [],
    summary: {
      auditId,
      auditDate: null,
      countsByType: {},
      searchConsoleWindow: null,
      rankCheckDate: null,
      inspectedCount: 0,
      notCrawledByFolder: [],
      ignoredPages: 0,
      ignoredPaths: [],
    },
    notes,
  } satisfies AuditSearchCheck;
}

/** Search Console problems that should degrade the check, not fail it. Anything
 *  else is a real bug and propagates. */
function describeGscSkip(error: unknown): string | null {
  if (error instanceof GscNotConnectedError) {
    return "Search Console is not connected for this project, so only Rank Tracking was used. Connect it for page-level search demand and URL Inspection.";
  }
  if (isExpectedGrantFailure(error)) {
    return "The Search Console connection has expired or was revoked, so only Rank Tracking was used. Reconnect it to include Search Console.";
  }
  if (error instanceof GscApiError) {
    return `Search Console returned an error (${error.message}), so only Rank Tracking was used.`;
  }
  return null;
}

async function loadSearchConsole(
  projectId: string,
  dateRange: NonNullable<AuditSearchCheckInput["dateRange"]>,
): Promise<{ data: SearchConsoleData | null; note: string | null }> {
  try {
    const performance = await GscService.getPerformance({
      projectId,
      dimensions: ["page"],
      dateRange,
      rowLimit: GSC_MAX_ROW_LIMIT,
    });
    const rows = performance.rows.flatMap((row) =>
      row.keys?.[0]
        ? [
            {
              url: row.keys[0],
              clicks: row.clicks,
              impressions: row.impressions,
              position: row.position,
            },
          ]
        : [],
    );
    const { startDate, endDate } = performance.request;
    return { data: { rows, window: { startDate, endDate } }, note: null };
  } catch (error) {
    const note = describeGscSkip(error);
    if (!note) throw error;
    return { data: null, note };
  }
}

async function loadTrackedUrls(projectId: string) {
  const configs = (await RankTrackingService.getConfigs(projectId)).filter(
    (config) => config.isActive,
  );
  const trackers = await Promise.all(
    configs.map((config) =>
      RankTrackingService.getTracker(config.id, projectId),
    ),
  );
  const trackedUrls: TrackedRankingUrl[] = [];
  let rankCheckDate: string | null = null;
  for (const { results } of trackers) {
    const checkedAt = results.run?.lastCheckedAt ?? null;
    if (checkedAt && (!rankCheckDate || checkedAt > rankCheckDate)) {
      rankCheckDate = checkedAt;
    }
    for (const row of results.rows) {
      for (const device of ["desktop", "mobile"] as const) {
        const { rankingUrl, position } = row[device];
        if (rankingUrl) {
          trackedUrls.push({
            url: rankingUrl,
            keyword: row.keyword,
            device,
            position,
          });
        }
      }
    }
  }
  return { trackedUrls, rankCheckDate };
}

/** URL Inspection for the highest-demand pages the audit never crawled. */
async function inspectUncrawled(
  projectId: string,
  urls: string[],
): Promise<{ inspections: InspectedUrl[]; note: string | null }> {
  if (urls.length === 0) return { inspections: [], note: null };
  try {
    const { results } = await GscService.inspectUrls({ projectId, urls });
    return {
      inspections: results.map(({ url, result }) => ({ url, result })),
      note: null,
    };
  } catch (error) {
    const note = describeGscSkip(error);
    if (!note) throw error;
    return { inspections: [], note: `URL Inspection skipped: ${note}` };
  }
}

async function getSearchChecks(
  input: AuditSearchCheckInput & { projectId: string },
): Promise<AuditSearchCheck> {
  const audit = await AuditSearchCheckQueries.getAuditToCheck(
    input.projectId,
    input.auditId,
  );
  if (!audit) {
    return emptyResult([
      input.auditId
        ? `Audit ${input.auditId} not found in this project.`
        : "No completed site audit exists for this project yet. Start one with run_site_audit, then run this again.",
    ]);
  }
  if (audit.status !== "completed") {
    return emptyResult(
      [
        `Audit ${audit.id} is ${audit.status}, not completed. Wait for it to finish or pick another audit.`,
      ],
      audit.id,
    );
  }

  const minImpressions = input.minImpressions ?? DEFAULT_MIN_IMPRESSIONS;
  const maxInspections = input.maxInspections ?? DEFAULT_MAX_INSPECTIONS;
  const [pages, searchConsole, tracking] = await Promise.all([
    AuditSearchCheckQueries.getPagesForSearchCheck(audit.id),
    loadSearchConsole(input.projectId, input.dateRange ?? DEFAULT_DATE_RANGE),
    loadTrackedUrls(input.projectId),
  ]);

  const ignorePaths = input.ignorePaths ?? [];
  const ruleInput = {
    ignorePaths,
    auditStartUrl: audit.startUrl,
    pages,
    gscRows: searchConsole.data?.rows ?? [],
    trackedUrls: tracking.trackedUrls,
    minImpressions,
  };
  let result = findSearchIssues({ ...ruleInput, inspections: [] });
  const notes = searchConsole.note ? [searchConsole.note] : [];

  let inspectedCount = 0;
  if (searchConsole.data && maxInspections > 0) {
    const toInspect = result.findings
      .filter((finding) => finding.type === "search-page-not-crawled")
      .slice(0, maxInspections)
      .map((finding) => finding.url);
    const inspected = await inspectUncrawled(input.projectId, toInspect);
    if (inspected.note) notes.push(inspected.note);
    inspectedCount = inspected.inspections.length;
    if (inspectedCount > 0) {
      result = findSearchIssues({
        ...ruleInput,
        inspections: inspected.inspections,
      });
    }
  }

  const countsByType: Record<string, number> = {};
  for (const finding of result.findings) {
    countsByType[finding.type] = (countsByType[finding.type] ?? 0) + 1;
  }
  const notCrawledShown = input.maxNotCrawled ?? DEFAULT_MAX_NOT_CRAWLED_SHOWN;
  const { kept, notCrawledByFolder } = trimNotCrawled(
    result.findings,
    notCrawledShown,
  );
  const trimmedCount = notCrawledByFolder.reduce((n, g) => n + g.count, 0);
  if (trimmedCount > 0) {
    notes.push(
      `Showing the top ${notCrawledShown} of ${notCrawledShown + trimmedCount} not-crawled pages by impressions; the other ${trimmedCount} are grouped by folder in summary.notCrawledByFolder.`,
    );
  }
  if (result.ignoredPages > 0) {
    notes.push(
      `${result.ignoredPages} page(s) with search demand were left out under ignorePaths (${ignorePaths.join(", ")}).`,
    );
  }
  return {
    findings: kept,
    summary: {
      auditId: audit.id,
      auditDate: audit.completedAt ?? audit.startedAt,
      countsByType,
      searchConsoleWindow: searchConsole.data?.window ?? null,
      rankCheckDate: tracking.rankCheckDate,
      inspectedCount,
      notCrawledByFolder,
      ignoredPages: result.ignoredPages,
      ignoredPaths: result.ignoredPages > 0 ? ignorePaths : [],
    },
    notes: [...notes, ...result.notes],
  };
}

export const AuditSearchCheckService = { getSearchChecks };
