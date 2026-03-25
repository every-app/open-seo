import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  ExternalLink,
  FileWarning,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { LighthouseIssue } from "./types";

export function LighthouseIssueRow({ issue }: { issue: LighthouseIssue }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(issue.description || issue.items.length > 0);

  return (
    <>
      <tr
        className={`hover:bg-base-200/50 transition-colors ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setOpen(!open)}
      >
        <td className="py-3 pl-4 pr-2">
          {hasDetails ? (
            <ChevronRight
              className={`size-3.5 text-base-content/40 transition-transform ${open ? "rotate-90" : ""}`}
            />
          ) : null}
        </td>
        <td className="py-3 pr-3">
          <span
            className={`badge badge-sm border ${severityBadgeClass(issue.severity)} gap-1`}
          >
            {severityIcon(issue.severity)}
            {issue.severity}
          </span>
        </td>
        <td className="py-3 pr-3">
          <div>
            <p className="font-medium text-sm leading-snug">{issue.title}</p>
            {issue.displayValue ? (
              <p className="text-xs text-base-content/50 mt-0.5">
                {issue.displayValue}
              </p>
            ) : null}
          </div>
        </td>
        <td className="py-3 pr-3 hidden sm:table-cell">
          <span className="text-xs text-base-content/50">{issue.category}</span>
        </td>
        <td className="py-3 pr-3 hidden md:table-cell text-right">
          {issue.impactMs != null || issue.impactBytes != null ? (
            <span className="text-xs tabular-nums text-base-content/50">
              {issue.impactMs ? formatMs(issue.impactMs) : null}
              {issue.impactMs && issue.impactBytes ? " / " : null}
              {issue.impactBytes ? formatBytes(issue.impactBytes) : null}
            </span>
          ) : null}
        </td>
        <td className="py-3 pr-4 text-right">
          {issue.score != null ? (
            <span className="text-xs tabular-nums text-base-content/50">
              {issue.score}
            </span>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr className="!bg-transparent">
          <td colSpan={6} className="pb-4 pt-2 pl-[8.5rem] pr-4">
            <div className="space-y-3">
              {issue.description ? (
                <div className="text-sm text-base-content/70 leading-relaxed">
                  {renderInlineMarkdown(issue.description)}
                </div>
              ) : null}
              {issue.items.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-base-content/60 text-xs">
                    Affected items ({issue.items.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {issue.items.map((item, itemIndex) => (
                      <pre
                        key={`${issue.auditKey}-${itemIndex}`}
                        className="bg-base-200/60 p-2 rounded overflow-x-auto text-xs leading-relaxed"
                      >
                        {item}
                      </pre>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function renderInlineMarkdown(markdown: string): ReactNode {
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

  return nodes.length ? nodes : markdown;
}

function severityBadgeClass(severity: "critical" | "warning" | "info") {
  if (severity === "critical") {
    return "border-error/30 bg-error/10 text-error/80";
  }
  if (severity === "warning") {
    return "border-warning/35 bg-warning/10 text-warning/80";
  }
  return "border-info/30 bg-info/10 text-info/80";
}

function severityIcon(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return <FileWarning className="size-3" />;
  if (severity === "warning") return <TriangleAlert className="size-3" />;
  return <Info className="size-3" />;
}
