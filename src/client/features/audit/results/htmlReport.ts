import type { AuditResultsData } from "@/client/features/audit/results/types";
import { resolveIssueSeverity } from "@/client/features/audit/results/IssuesView";
import { isLighthouseFailure } from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { downloadFile } from "@/client/lib/download";
import {
  type AuditIssueType,
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import {
  actionItem,
  CATEGORIES,
  type Category,
  categoryBarChart,
  esc,
  executiveSummaryList,
  findingsByCategory,
  focusCards,
  type IssueGroup,
  lighthouseStatGrid,
  pagesSection,
  performanceSection,
  plural,
  scoreTone,
  statGrid,
} from "@/client/features/audit/results/htmlReportSections";
import { REPORT_CSS } from "@/client/features/audit/results/htmlReportStyles";

type Issue = AuditResultsData["issues"][number];

// `satisfies` forces every new issue type to be placed in a report category.
const ISSUE_CATEGORY = {
  "blocked-page": "Crawlability",
  "rate-limited-page": "Crawlability",
  "crawl-rate-limited": "Crawlability",
  "server-error": "Crawlability",
  "broken-page": "Crawlability",
  "redirect-chain": "Crawlability",
  "redirect-loop": "Crawlability",
  "broken-internal-link": "Links",
  "orphan-page": "Links",
  "no-outgoing-links": "Links",
  "deep-page": "Links",
  "noindex-page": "Indexability",
  "canonicalized-page": "Indexability",
  "canonical-conflict": "Indexability",
  "missing-title": "On-Page SEO",
  "duplicate-title": "On-Page SEO",
  "title-too-long": "On-Page SEO",
  "title-too-short": "On-Page SEO",
  "missing-meta-description": "On-Page SEO",
  "duplicate-meta-description": "On-Page SEO",
  "meta-description-too-long": "On-Page SEO",
  "meta-description-too-short": "On-Page SEO",
  "missing-h1": "On-Page SEO",
  "multiple-h1": "On-Page SEO",
  "heading-order-skip": "On-Page SEO",
  "duplicate-content": "Content",
  "thin-content": "Content",
  "images-missing-alt": "Images",
  "slow-response": "Performance",
} as const satisfies Record<AuditIssueType, Category>;

const categoryMap: Record<string, Category> = ISSUE_CATEGORY;

// Share of affected pages is multiplied by this weight and subtracted from 100.
const SEVERITY_WEIGHT: Record<IssueSeverity, number> = {
  critical: 1,
  warning: 0.5,
  info: 0.1,
};

export function downloadAuditHtmlReport(data: AuditResultsData) {
  const generatedAt = new Date();
  const host = hostOf(data.audit.startUrl).replace(/^www\./, "");
  const filename = `seo-audit-${host.replace(/[^a-z0-9]+/gi, "-")}-${isoDate(generatedAt)}.html`;
  downloadFile(buildAuditHtmlReport(data, generatedAt), filename, "text/html");
}

export function buildAuditHtmlReport(
  data: AuditResultsData,
  generatedAt: Date,
): string {
  const { audit, pages, lighthouse, issues } = data;
  const host = hostOf(audit.startUrl);
  const totalPages = Math.max(pages.length, 1);
  const groups = groupIssues(issues);
  const categoryScores = scoreCategories(groups, totalPages);
  const siteScore = Math.round(
    categoryScores.reduce((sum, row) => sum + row.score, 0) /
      categoryScores.length,
  );
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const group of groups) counts[group.severity] += group.issues.length;
  const lighthouseAverages = averageLighthouse(lighthouse);
  const title = `${host} — SEO Audit Report`;

  const body = [
    `<h1>${esc(title)}</h1>`,
    `<p class="intro">${esc(introSentence(siteScore, counts, groups))}</p>`,
    `<p class="small">Generated ${isoDate(generatedAt)} · Start URL <a href="${esc(audit.startUrl)}">${esc(audit.startUrl)}</a> · ${audit.pagesCrawled} pages crawled${audit.completedAt ? ` · Audit completed ${isoDate(new Date(audit.completedAt))}` : ""}</p>`,
    dataQualityAside(pages, issues),
    `<h2>Scorecard</h2>`,
    statGrid([
      {
        value: String(siteScore),
        label: "Site SEO score",
        tone: scoreTone(siteScore),
      },
      { value: String(audit.pagesCrawled), label: "Pages crawled" },
      {
        value: String(counts.critical),
        label: "Critical issues",
        tone: counts.critical > 0 ? "red" : "green",
      },
      {
        value: String(counts.warning),
        label: "Warnings",
        tone: counts.warning > 0 ? "amber" : "green",
      },
    ]),
    lighthouseAverages ? lighthouseStatGrid(lighthouseAverages) : "",
    focusCards(categoryScores, groups),
    `<h2>Executive Summary</h2>`,
    `<div class="pullquote">${esc(pullquote(counts, groups, totalPages))}</div>`,
    executiveSummaryList(groups, totalPages),
    `<hr class="decorative">`,
    `<h2>Full SEO Audit</h2>`,
    categoryBarChart(categoryScores),
    `<p class="small">Each category starts at 100. Every issue type subtracts the share of crawled pages it affects, weighted by severity (critical ×1, warning ×0.5, info ×0.1). The site score is the average of the category scores.</p>`,
    `<h3>Findings by category</h3>`,
    findingsByCategory(groups),
    `<h2>Action Plan</h2>`,
    groups.length === 0
      ? `<p>No issues found. Nothing to fix.</p>`
      : groups.map((group) => actionItem(group, totalPages)).join("\n"),
    lighthouse.length > 0 ? performanceSection(lighthouse, pages) : "",
    pagesSection(pages, issues),
    `<hr>`,
    `<p class="small">Generated by OpenSEO from site audit <code>${esc(audit.id)}</code>.</p>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — ${isoDate(generatedAt)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:type" content="website">
<style>${REPORT_CSS}</style>
</head>
<body>

${body}

</body>
</html>
`;
}

function groupIssues(issues: Issue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    let group = groups.get(issue.issueType);
    if (!group) {
      const descriptor = getIssueDescriptor(issue.issueType);
      group = {
        issueType: issue.issueType,
        severity: resolveIssueSeverity(issue),
        category: categoryMap[issue.issueType] ?? "Other",
        title: descriptor?.title ?? issue.issueType,
        explanation: descriptor?.explanation ?? "",
        howToFix: descriptor?.howToFix ?? "",
        issues: [],
        affectedPages: 0,
      };
      groups.set(issue.issueType, group);
    }
    group.issues.push(issue);
  }
  for (const group of groups.values()) {
    group.affectedPages = new Set(
      group.issues.map((issue) => issue.pageUrl),
    ).size;
  }
  const sorted = [...groups.values()];
  sorted.sort(
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
      b.affectedPages - a.affectedPages,
  );
  return sorted;
}

function scoreCategories(groups: IssueGroup[], totalPages: number) {
  const categories: Category[] = [...CATEGORIES];
  if (groups.some((group) => group.category === "Other"))
    categories.push("Other");
  return categories.map((category) => {
    const penalty = groups
      .filter((group) => group.category === category)
      .reduce(
        (sum, group) =>
          sum +
          SEVERITY_WEIGHT[group.severity] *
            100 *
            Math.min(1, group.affectedPages / totalPages),
        0,
      );
    return { category, score: Math.max(0, Math.round(100 - penalty)) };
  });
}

function averageLighthouse(lighthouse: AuditResultsData["lighthouse"]) {
  const ok = lighthouse.filter((row) => !isLighthouseFailure(row));
  if (ok.length === 0) return null;
  const average = (
    key:
      | "performanceScore"
      | "accessibilityScore"
      | "bestPracticesScore"
      | "seoScore",
  ) => {
    const values = ok
      .map((row) => row[key])
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
  };
  return {
    performance: average("performanceScore"),
    accessibility: average("accessibilityScore"),
    bestPractices: average("bestPracticesScore"),
    seo: average("seoScore"),
  };
}

function introSentence(
  siteScore: number,
  counts: Record<IssueSeverity, number>,
  groups: IssueGroup[],
) {
  if (groups.length === 0) {
    return `The site scores ${siteScore} and the crawl found no issues.`;
  }
  const top = groups[0];
  if (counts.critical > 0) {
    return `The site scores ${siteScore}. ${counts.critical} critical ${plural(counts.critical, "issue")} need attention first, led by “${top.title}” on ${top.affectedPages} ${plural(top.affectedPages, "page")}.`;
  }
  return `The site scores ${siteScore} with no critical issues. The largest remaining item is “${top.title}” on ${top.affectedPages} ${plural(top.affectedPages, "page")}.`;
}

function pullquote(
  counts: Record<IssueSeverity, number>,
  groups: IssueGroup[],
  totalPages: number,
) {
  if (groups.length === 0) return "Nothing to fix on the crawled pages.";
  const worst = groups[0];
  const share = Math.round((worst.affectedPages / totalPages) * 100);
  if (counts.critical > 0) {
    return `Fix “${worst.title}” first: it affects ${share}% of crawled pages.`;
  }
  return `No critical problems. The biggest gain is “${worst.title}”, on ${share}% of crawled pages.`;
}

function dataQualityAside(
  pages: AuditResultsData["pages"],
  issues: AuditResultsData["issues"],
) {
  const blocked = pages.filter((page) => page.fetchClass === "blocked").length;
  const rateLimited = pages.filter(
    (page) => page.fetchClass === "rate_limited",
  ).length;
  const stopped = issues.some(
    (issue) => issue.issueType === "crawl-rate-limited",
  );
  const notes: string[] = [];
  if (blocked > 0)
    notes.push(
      `${blocked} ${plural(blocked, "page")} blocked by bot protection`,
    );
  if (rateLimited > 0)
    notes.push(
      `${rateLimited} ${plural(rateLimited, "page")} rate limited (429)`,
    );
  if (stopped)
    notes.push(
      "crawl stopped early because of the site’s rate limit, so this report is incomplete",
    );
  if (notes.length === 0) return "";
  return `<aside><strong>Data quality.</strong> ${esc(notes.join(" · "))}. Those pages could not be audited.</aside>`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
