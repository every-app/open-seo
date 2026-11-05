/**
 * The search check's rules. A pure function: audit pages, Search Console page
 * rows, tracked ranking URLs and URL Inspection results in, findings out.
 * No network or database access, so it can be tested directly.
 */
import type { UrlInspectionResult } from "@/server/lib/gscClient";
import { canonicalUrlKey, normalizeUrl } from "@/server/lib/audit/url-utils";
import { stripTrackingParams } from "@/server/lib/trackingParams";
import { NOINDEX_CRITICAL_IMPRESSIONS } from "@/server/features/audit-search-check/searchCheckThresholds";
import { ISSUE_SEVERITY_ORDER } from "@/shared/audit-issues";
import type { SearchCheckFinding } from "@/types/schemas/auditSearchCheck";

export type SearchCheckAuditPage = {
  url: string;
  statusCode: number | null;
  fetchClass: string | null;
  redirectUrl: string | null;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
};

export type SearchConsolePageRow = {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type TrackedRankingUrl = {
  url: string;
  keyword: string;
  device: "desktop" | "mobile";
  position: number | null;
};

export type InspectedUrl = {
  url: string;
  result: UrlInspectionResult | null;
};

type Demand = {
  url: string;
  clicks: number;
  impressions: number;
  /** Impression-weighted average of the merged Search Console rows. */
  averagePosition: number | null;
  tracked: TrackedRankingUrl[];
};

const NOT_INDEXED_FIXES =
  "Confirm the noindex is deliberate. If the page should be found in Google, remove the noindex (meta robots tag or X-Robots-Tag header) and request reindexing in Search Console.";

/** Tracking parameters off, host and query normalised, so rows for the same
 *  page merge and audit URLs line up with Search Console URLs. */
function urlKey(rawUrl: string): string {
  const cleaned = stripTrackingParams(rawUrl);
  return canonicalUrlKey(normalizeUrl(cleaned) ?? cleaned);
}

/** Like urlKey but keeps `www.`, so the www and non-www versions of a page stay
 *  separate when the audit crawled both. */
function exactKey(rawUrl: string): string {
  const cleaned = stripTrackingParams(rawUrl);
  const normalized = normalizeUrl(cleaned) ?? cleaned;
  try {
    const parsed = new URL(normalized);
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return normalized.toLowerCase();
  }
}

function pathOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "";
  }
}

function hostOf(key: string): string | null {
  try {
    return new URL(key).hostname;
  } catch {
    return null;
  }
}

function hasNoindex(directives: string | null): boolean {
  if (!directives) return false;
  return directives
    .toLowerCase()
    .split(/[\s,]+/)
    .some((token) => token === "noindex" || token === "none");
}

function gatherDemand(
  gscRows: SearchConsolePageRow[],
  trackedUrls: TrackedRankingUrl[],
  auditHost: string | null,
  skippedHosts: Set<string>,
): Map<string, Demand> {
  const demand = new Map<string, Demand>();
  // Weighted position sums are kept aside so the average is exact after merging.
  const weightedPosition = new Map<string, number>();

  function entryFor(rawUrl: string): Demand | null {
    const host = hostOf(urlKey(rawUrl));
    if (host !== auditHost) {
      skippedHosts.add(host ?? rawUrl);
      return null;
    }
    const key = exactKey(rawUrl);
    let entry = demand.get(key);
    if (!entry) {
      entry = {
        url: stripTrackingParams(rawUrl),
        clicks: 0,
        impressions: 0,
        averagePosition: null,
        tracked: [],
      };
      demand.set(key, entry);
    }
    return entry;
  }

  for (const row of gscRows) {
    const entry = entryFor(row.url);
    if (!entry) continue;
    const key = exactKey(row.url);
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    weightedPosition.set(
      key,
      (weightedPosition.get(key) ?? 0) + row.position * row.impressions,
    );
  }
  for (const [key, entry] of demand) {
    if (entry.impressions > 0) {
      entry.averagePosition =
        (weightedPosition.get(key) ?? 0) / entry.impressions;
    }
  }
  for (const tracked of trackedUrls) {
    entryFor(tracked.url)?.tracked.push(tracked);
  }
  return demand;
}

function describeDemand(demand: Demand): string {
  const parts = [
    `${demand.impressions} impressions, ${demand.clicks} clicks in Search Console`,
  ];
  if (demand.tracked.length > 0) {
    const keywords = demand.tracked
      .map((t) => `"${t.keyword}" (${t.device} #${t.position ?? "?"})`)
      .join(", ");
    parts.push(`tracked ranking URL for ${keywords}`);
  }
  return parts.join("; ");
}

function inspectionProblem(result: UrlInspectionResult | null): string | null {
  const index = result?.indexStatusResult;
  if (!index) return null;
  const blockedState = index.indexingState?.startsWith("BLOCKED_");
  if (blockedState) return `indexing state ${index.indexingState}`;
  if (index.robotsTxtState === "DISALLOWED") return "blocked by robots.txt";
  const fetchState = index.pageFetchState;
  if (
    fetchState &&
    fetchState !== "SUCCESSFUL" &&
    fetchState !== "PAGE_FETCH_STATE_UNSPECIFIED"
  ) {
    return `page fetch state ${fetchState}`;
  }
  return null;
}

function lastCrawl(result: UrlInspectionResult | null): string {
  const time = result?.indexStatusResult?.lastCrawlTime;
  return time ? ` (Google last crawled it ${time.slice(0, 10)})` : "";
}

export function findSearchIssues(input: {
  auditStartUrl: string;
  pages: SearchCheckAuditPage[];
  gscRows: SearchConsolePageRow[];
  trackedUrls: TrackedRankingUrl[];
  inspections: InspectedUrl[];
  minImpressions: number;
  /** Path prefixes (e.g. "/teams/") whose pages are left out entirely. */
  ignorePaths: string[];
}): {
  findings: SearchCheckFinding[];
  notes: string[];
  ignoredPages: number;
} {
  const notes: string[] = [];
  const skippedHosts = new Set<string>();
  const auditHost = hostOf(urlKey(input.auditStartUrl));
  const demandByKey = gatherDemand(
    input.gscRows,
    input.trackedUrls,
    auditHost,
    skippedHosts,
  );
  const inspectionByKey = new Map(
    input.inspections.map((inspected) => [
      exactKey(inspected.url),
      inspected.result,
    ]),
  );
  // Exact (www-sensitive) lookup first; the merged key is the fallback for a
  // page the audit only reached under the other host.
  const pageByExactKey = new Map<string, SearchCheckAuditPage>();
  const pageByKey = new Map<string, SearchCheckAuditPage>();
  for (const page of input.pages) {
    if (!pageByExactKey.has(exactKey(page.url))) {
      pageByExactKey.set(exactKey(page.url), page);
    }
    const key = urlKey(page.url);
    if (!pageByKey.has(key)) pageByKey.set(key, page);
  }
  const ignorePrefixes = input.ignorePaths.map((prefix) =>
    prefix.startsWith("/") ? prefix : `/${prefix}`,
  );
  let ignoredPages = 0;

  const findings: SearchCheckFinding[] = [];
  let skippedUnreadable = 0;

  for (const [exact, demand] of demandByKey) {
    if (
      demand.impressions < input.minImpressions &&
      demand.tracked.length === 0
    ) {
      continue;
    }
    const path = pathOf(demand.url);
    if (ignorePrefixes.some((prefix) => path.startsWith(prefix))) {
      ignoredPages += 1;
      continue;
    }
    const key = urlKey(demand.url);
    const base = {
      url: demand.url,
      impressions: demand.impressions,
      clicks: demand.clicks,
      averagePosition: demand.averagePosition,
      trackedKeywords: demand.tracked.map(({ keyword, device, position }) => ({
        keyword,
        device,
        position,
      })),
    };
    const demandText = describeDemand(demand);
    const page = pageByExactKey.get(exact) ?? pageByKey.get(key);

    if (!page) {
      // An inspection finding replaces the not-crawled warning: it says more.
      const inspected: SearchCheckFinding[] = [];
      const inspection = inspectionByKey.get(exact) ?? null;
      const userCanonical = inspection?.indexStatusResult?.userCanonical;
      if (userCanonical && urlKey(userCanonical) !== key) {
        inspected.push({
          ...base,
          type: "inspected-canonical-elsewhere",
          severity: "critical",
          evidence: `${demandText}. URL Inspection: the page declares its canonical as ${userCanonical}${lastCrawl(inspection)}.`,
          howToFix:
            "Point the canonical tag back at this page, unless another page is meant to replace it. In that case 301 redirect this URL to it.",
        });
      }
      const problem = inspectionProblem(inspection);
      if (problem) {
        inspected.push({
          ...base,
          type: "inspected-not-indexable",
          severity: "critical",
          evidence: `${demandText}. URL Inspection: ${problem}${lastCrawl(inspection)}.`,
          howToFix: NOT_INDEXED_FIXES,
        });
      }
      if (inspected.length > 0) {
        findings.push(...inspected);
      } else {
        findings.push({
          ...base,
          type: "search-page-not-crawled",
          severity: "warning",
          evidence: `${demandText}. The audit did not crawl this page.`,
          howToFix:
            "Link to the page from a crawlable page or add it to the sitemap so audits can reach it. Then check its canonical and robots settings by hand.",
        });
      }
      continue;
    }

    // A blocked or rate-limited fetch tells us nothing about the page itself.
    if (page.fetchClass === "blocked" || page.fetchClass === "rate_limited") {
      skippedUnreadable += 1;
      continue;
    }

    if (page.statusCode !== null && page.statusCode >= 400) {
      findings.push({
        ...base,
        type: "broken-page-with-search-demand",
        severity: "critical",
        evidence: `${demandText}. The audit got HTTP ${page.statusCode}.`,
        howToFix:
          "Restore the page, or 301 redirect it to the closest matching page, so searchers stop landing on an error.",
      });
      continue;
    }

    const redirectsTo = page.redirectUrl;
    if (redirectsTo || (page.statusCode ?? 0) >= 300) {
      // The Search Console URL is the redirect's destination, not its source.
      if (redirectsTo && exactKey(redirectsTo) === exact) continue;
      findings.push({
        ...base,
        type: "redirect-with-search-demand",
        severity: "info",
        evidence: `${demandText}. The audit found this URL redirects${redirectsTo ? ` to ${redirectsTo}` : ""}.`,
        howToFix:
          "Normal for a few weeks after a change. If Search Console keeps showing the old URL, check internal links and the sitemap still point at the new one.",
      });
      continue;
    }

    const noindexSource = hasNoindex(page.robotsMeta)
      ? `robots meta "${page.robotsMeta}"`
      : hasNoindex(page.xRobotsTag)
        ? `X-Robots-Tag "${page.xRobotsTag}"`
        : null;
    if (noindexSource) {
      findings.push({
        ...base,
        type: "noindex-page-with-search-demand",
        severity:
          demand.tracked.length > 0 ||
          demand.impressions >= NOINDEX_CRITICAL_IMPRESSIONS
            ? "critical"
            : "warning",
        evidence: `${demandText}. The page is set to noindex (${noindexSource}).`,
        howToFix: NOT_INDEXED_FIXES,
      });
    }

    const canonical = page.canonicalUrl
      ? normalizeUrl(page.canonicalUrl, page.url)
      : null;
    if (canonical && urlKey(canonical) !== key) {
      findings.push({
        ...base,
        type: "canonical-elsewhere-with-search-demand",
        severity: "warning",
        evidence: `${demandText}. The page's canonical points to ${canonical}, yet Google still shows this URL.`,
        howToFix:
          "Check the canonical is intended. If this page should be the one found, point the canonical at itself. If it is a duplicate, 301 redirect it to the canonical page instead.",
      });
    }
  }

  if (skippedHosts.size > 0) {
    notes.push(
      `Skipped URLs on other hosts than the audit's (${[...skippedHosts].slice(0, 5).join(", ")}).`,
    );
  }
  if (skippedUnreadable > 0) {
    notes.push(
      `${skippedUnreadable} page(s) with search demand were skipped because the audit's crawler was blocked or rate limited on them.`,
    );
  }

  findings.sort(
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
      b.impressions - a.impressions,
  );
  return { findings, notes, ignoredPages };
}

/** "/glossary/term" -> "/glossary/"; a page directly under the root -> "/". */
function firstFolder(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.length > 1 ? `/${segments[0]}/` : "/";
  } catch {
    return "/";
  }
}

/** Keeps the highest-impression not-crawled findings and groups the rest by
 *  folder. Findings arrive sorted by impressions within each severity. */
export function trimNotCrawled(findings: SearchCheckFinding[], limit: number) {
  const kept: SearchCheckFinding[] = [];
  const folders = new Map<
    string,
    { count: number; impressions: number; clicks: number }
  >();
  let seen = 0;
  for (const finding of findings) {
    if (finding.type !== "search-page-not-crawled" || seen++ < limit) {
      kept.push(finding);
      continue;
    }
    const folder = firstFolder(finding.url);
    const group = folders.get(folder) ?? {
      count: 0,
      impressions: 0,
      clicks: 0,
    };
    group.count += 1;
    group.impressions += finding.impressions;
    group.clicks += finding.clicks;
    folders.set(folder, group);
  }
  const notCrawledByFolder = [...folders]
    .map(([folder, group]) => ({ folder, ...group }))
    // eslint-disable-next-line unicorn/no-array-sort -- the TS lib target lacks toSorted, and this is our own copy
    .sort((a, b) => b.impressions - a.impressions);
  return { kept, notCrawledByFolder };
}
