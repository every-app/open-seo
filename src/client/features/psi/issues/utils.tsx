import type { ReactNode } from "react";
import { ExternalLink, FileWarning, Info, TriangleAlert } from "lucide-react";
import { buildCsv } from "@/client/lib/csv";
import type { CategoryTab, PsiIssue } from "./types";

export function categoryLabel(category: CategoryTab) {
  if (category === "best-practices") return "Best practices";
  if (category === "all") return "All";
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

export function categorySlug(category: CategoryTab) {
  return category === "all" ? "all" : category;
}

export function issuesToCsv(issues: PsiIssue[]) {
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

export function renderInlineMarkdown(markdown: string): ReactNode {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = linkPattern.exec(markdown);

  while (match) {
    const [raw, label, href] = match;
    const index = match.index;

    if (index > cursor) {
      nodes.push(markdown.slice(cursor, index));
    }

    nodes.push(
      <a
        key={`${href}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-primary inline-flex items-center gap-1"
      >
        {label}
        <ExternalLink className="size-3" />
      </a>,
    );

    cursor = index + raw.length;
    match = linkPattern.exec(markdown);
  }

  if (cursor < markdown.length) {
    nodes.push(markdown.slice(cursor));
  }

  if (!nodes.length) {
    return markdown;
  }

  return nodes;
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

export function severityBadgeClass(severity: "critical" | "warning" | "info") {
  if (severity === "critical") {
    return "border-error/30 bg-error/10 text-error/80";
  }
  if (severity === "warning") {
    return "border-warning/35 bg-warning/10 text-warning/80";
  }
  return "border-info/30 bg-info/10 text-info/80";
}

export function severityIcon(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return <FileWarning className="size-3" />;
  if (severity === "warning") return <TriangleAlert className="size-3" />;
  return <Info className="size-3" />;
}
