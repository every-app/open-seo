import type { AuditResultsData } from "@/client/features/audit/results/types";
import { isLighthouseFailure } from "@/client/features/audit/results/AuditResultsTableFilterLogic";
import { escapeHtml } from "@/client/lib/clipboard";
import type { IssueSeverity } from "@/shared/audit-issues";

type Issue = AuditResultsData["issues"][number];

export const CATEGORIES = [
  "Crawlability",
  "Links",
  "Indexability",
  "On-Page SEO",
  "Content",
  "Images",
  "Performance",
] as const;
export type Category = (typeof CATEGORIES)[number] | "Other";

const SEVERITY_BADGE: Record<
  IssueSeverity,
  { className: string; label: string }
> = {
  critical: { className: "critical", label: "Critical" },
  warning: { className: "important", label: "Warning" },
  info: { className: "muted", label: "Info" },
};

const MAX_EVIDENCE_URLS = 50;
const MAX_PAGE_ROWS = 25;

export interface IssueGroup {
  issueType: string;
  severity: IssueSeverity;
  category: Category;
  title: string;
  explanation: string;
  howToFix: string;
  issues: Issue[];
  affectedPages: number;
}

interface StatCard {
  value: string;
  label: string;
  tone?: "red" | "amber" | "green";
  meta?: string;
}

export function statGrid(cards: StatCard[]) {
  const html = cards
    .map(
      (card) =>
        `<div class="stat-card${card.tone ? ` ${card.tone}` : ""}"><div class="stat-value${card.value === "—" ? " na" : ""}">${esc(card.value)}</div><div class="stat-label">${esc(card.label)}</div>${card.meta ? `<div class="stat-meta">${esc(card.meta)}</div>` : ""}</div>`,
    )
    .join("");
  return `<div class="stat-grid" data-cols="${Math.min(cards.length, 4)}">${html}</div>`;
}

export function lighthouseStatGrid(
  averages: Record<
    "performance" | "accessibility" | "bestPractices" | "seo",
    number | null
  >,
) {
  const card = (value: number | null, label: string): StatCard => ({
    value: value == null ? "—" : String(value),
    label,
    tone: value == null ? undefined : scoreTone(value),
    meta: "Lighthouse average",
  });
  return statGrid([
    card(averages.performance, "Performance"),
    card(averages.accessibility, "Accessibility"),
    card(averages.bestPractices, "Best practices"),
    card(averages.seo, "Lighthouse SEO"),
  ]);
}

export function focusCards(
  categoryScores: Array<{ category: Category; score: number }>,
  groups: IssueGroup[],
) {
  const imperfect = categoryScores.filter((row) => row.score < 100);
  if (imperfect.length === 0) return "";
  imperfect.sort((a, b) => a.score - b.score);
  const cards = imperfect.slice(0, 2).map(({ category, score }) => {
    const top = groups.find((group) => group.category === category);
    const detail = top
      ? `Main driver: <mark>${esc(top.title)}</mark> on <mark>${top.affectedPages} ${plural(top.affectedPages, "page")}</mark>.`
      : "";
    return `<div class="card"><div class="card-body"><h4><span class="tag">${esc(category)}</span> scores ${score}</h4><p>${detail}</p></div></div>`;
  });
  return `<div class="card-row">\n${cards.join("\n")}\n</div>`;
}

export function executiveSummaryList(groups: IssueGroup[], totalPages: number) {
  if (groups.length === 0) return "";
  const items = groups.slice(0, 5).map((group) => {
    const badge = SEVERITY_BADGE[group.severity];
    return `<li><span class="badge ${badge.className}">${badge.label}</span> <strong>${esc(group.title)}</strong> (<code>${esc(group.issueType)}</code>): <mark>${group.affectedPages} of ${totalPages} pages</mark>. ${esc(group.howToFix)}</li>`;
  });
  return `<ul>\n${items.join("\n")}\n</ul>`;
}

export function categoryBarChart(
  categoryScores: Array<{ category: Category; score: number }>,
) {
  const rows = categoryScores.map(
    ({ category, score }) =>
      `<div class="bar-row"><div class="bar-label">${esc(category)}</div><div class="bar-track"><div class="bar-fill ${scoreTone(score)}" style="width:${Math.max(score, 4)}%"><span class="bar-count">${score}</span></div></div></div>`,
  );
  return `<div class="bar-chart"><h5>Category scores</h5>\n${rows.join("\n")}\n</div>`;
}

export function findingsByCategory(groups: IssueGroup[]) {
  if (groups.length === 0) return `<p>No findings.</p>`;
  const sections: string[] = [];
  for (const category of [...CATEGORIES, "Other" as const]) {
    const inCategory = groups.filter((group) => group.category === category);
    if (inCategory.length === 0) continue;
    const rows = inCategory.map((group) => {
      const badge = SEVERITY_BADGE[group.severity];
      return `<p class="finding-ref"><span class="badge ${badge.className}">${badge.label}</span> ${esc(group.title)} on ${group.affectedPages} ${plural(group.affectedPages, "page")} <a href="#fa-${esc(group.issueType)}">fix →</a></p>`;
    });
    sections.push(
      `<h4>${esc(category)}</h4>\n<div class="dist-chart">\n${rows.join("\n")}\n</div>`,
    );
  }
  return sections.join("\n");
}

export function actionItem(group: IssueGroup, totalPages: number) {
  const badge = SEVERITY_BADGE[group.severity];
  const evidence = group.issues.slice(0, MAX_EVIDENCE_URLS).map((issue) => {
    const details = formatDetails(issue.detailsJson);
    return `<li><code>${esc(issue.pageUrl)}</code>${details ? ` — ${esc(details)}` : ""}</li>`;
  });
  const more =
    group.issues.length > MAX_EVIDENCE_URLS
      ? `<li>…and ${group.issues.length - MAX_EVIDENCE_URLS} more (see the CSV export)</li>`
      : "";
  return `<div class="action-item" id="fa-${esc(group.issueType)}">
<p><span class="badge ${badge.className}">${badge.label}</span> <span class="tag">${esc(group.category)}</span> <strong>${esc(group.title)}</strong></p>
<p class="small">affects ${group.affectedPages} of ${totalPages} crawled pages</p>
${group.explanation ? `<p class="small">${esc(group.explanation)}</p>` : ""}
${group.howToFix ? `<p class="small"><strong>Fix:</strong> ${esc(group.howToFix)}</p>` : ""}
<details class="small"><summary>Evidence (${group.issues.length})</summary><ul>${evidence.join("")}${more}</ul></details>
</div>`;
}

export function performanceSection(
  lighthouse: AuditResultsData["lighthouse"],
  pages: AuditResultsData["pages"],
) {
  const urlById = new Map(pages.map((page) => [page.id, page.url]));
  const rows = lighthouse.map((row) => {
    if (isLighthouseFailure(row)) {
      return `<tr><td><code>${esc(urlById.get(row.pageId) ?? "")}</code></td><td>${row.strategy}</td><td colspan="6">Failed${row.errorMessage ? `: ${esc(row.errorMessage)}` : ""}</td></tr>`;
    }
    return `<tr><td><code>${esc(urlById.get(row.pageId) ?? "")}</code></td><td>${row.strategy}</td><td>${num(row.performanceScore)}</td><td>${num(row.accessibilityScore)}</td><td>${num(row.seoScore)}</td><td>${num(row.lcpMs)}</td><td>${row.cls == null ? "—" : row.cls.toFixed(3)}</td><td>${num(row.inpMs)}</td></tr>`;
  });
  return `<h2>Performance (Lighthouse)</h2>
<div class="table-wrap"><table class="compact striped"><thead><tr><th>URL</th><th>Device</th><th>Perf</th><th>A11y</th><th>SEO</th><th>LCP ms</th><th>CLS</th><th>INP ms</th></tr></thead><tbody>
${rows.join("\n")}
</tbody></table></div>`;
}

export function pagesSection(
  pages: AuditResultsData["pages"],
  issues: AuditResultsData["issues"],
) {
  const issueCount = new Map<string, number>();
  for (const issue of issues) {
    issueCount.set(issue.pageUrl, (issueCount.get(issue.pageUrl) ?? 0) + 1);
  }
  const withIssues = pages.filter((page) => issueCount.has(page.url));
  if (withIssues.length === 0) return "";
  withIssues.sort(
    (a, b) => (issueCount.get(b.url) ?? 0) - (issueCount.get(a.url) ?? 0),
  );
  const worst = withIssues.slice(0, MAX_PAGE_ROWS);
  const rows = worst.map(
    (page) =>
      `<tr><td><code>${esc(page.url)}</code></td><td>${num(page.statusCode)}</td><td>${issueCount.get(page.url) ?? 0}</td><td>${page.wordCount}</td><td>${num(page.responseTimeMs)}</td></tr>`,
  );
  return `<h2>Pages Needing Attention</h2>
<p class="small">The ${worst.length} crawled ${plural(worst.length, "page")} with the most issues.</p>
<div class="table-wrap"><table class="compact striped"><thead><tr><th>URL</th><th>Status</th><th>Issues</th><th>Words</th><th>Response ms</th></tr></thead><tbody>
${rows.join("\n")}
</tbody></table></div>`;
}

function formatDetails(detailsJson: string | null) {
  if (!detailsJson) return "";
  try {
    const details = JSON.parse(detailsJson) as unknown;
    if (!details || typeof details !== "object") return String(details);
    return Object.entries(details)
      .map(
        ([key, value]) =>
          `${key}: ${Array.isArray(value) ? value.join(" → ") : String(value)}`,
      )
      .join("; ");
  } catch {
    return detailsJson;
  }
}

export function scoreTone(score: number) {
  if (score >= 90) return "green";
  if (score >= 70) return "amber";
  return "red";
}

function num(value: number | null) {
  return value == null ? "—" : String(Math.round(value));
}

export function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

export function esc(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
