import { buildCsv, type CsvValue } from "@/client/lib/csv";
import type { CategoryTab, LighthouseIssue } from "./types";

const ISSUE_HEADERS = [
  "分类",
  "严重程度",
  "分数",
  "标题",
  "显示值",
  "说明",
  "影响（毫秒）",
  "影响（字节）",
  "受影响项目",
];

function issuesToRows(issues: LighthouseIssue[]): CsvValue[][] {
  return issues.map((issue) => [
    issue.category,
    issue.severity,
    issue.score ?? "",
    issue.title,
    issue.displayValue ?? "",
    issue.description ?? "",
    issue.impactMs ?? "",
    issue.impactBytes ?? "",
    issue.items.length,
  ]);
}

export function issuesToTable(issues: LighthouseIssue[]) {
  return { headers: ISSUE_HEADERS, rows: issuesToRows(issues) };
}

export function categoryLabel(category: CategoryTab) {
  if (category === "best-practices") return "最佳实践";
  if (category === "all") return "全部";
  if (category === "performance") return "性能";
  if (category === "accessibility") return "无障碍";
  return "SEO";
}

export function issuesToCsv(issues: LighthouseIssue[]) {
  return buildCsv(ISSUE_HEADERS, issuesToRows(issues));
}
