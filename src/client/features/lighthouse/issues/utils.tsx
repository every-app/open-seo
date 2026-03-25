import { buildCsv } from "@/client/lib/csv";
import type { CategoryTab, LighthouseIssue } from "./types";

export function categoryLabel(category: CategoryTab) {
  if (category === "best-practices") return "Best practices";
  if (category === "all") return "All";
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

export function categorySlug(category: CategoryTab) {
  return category === "all" ? "all" : category;
}

export function issuesToCsv(issues: LighthouseIssue[]) {
  const headers = [
    "Category",
    "Severity",
    "Score",
    "Title",
    "Display Value",
    "Description",
    "Impact (ms)",
    "Impact (bytes)",
    "Affected Items",
  ];

  const rows = issues.map((issue) => [
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

  return buildCsv(headers, rows);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
