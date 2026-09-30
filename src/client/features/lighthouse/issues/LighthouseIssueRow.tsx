import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  ExternalLink,
  FileWarning,
  Info,
  TriangleAlert,
} from "@/client/components/icons";
import type { LighthouseIssue } from "./types";

import { Badge, type BadgeProps } from "@/client/components/ui/badge";
import { TableCell, TableRow } from "@/client/components/ui/table";

export function LighthouseIssueRow({ issue }: { issue: LighthouseIssue }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(issue.description || issue.items.length > 0);

  return (
    <>
      <TableRow
        className={hasDetails ? "cursor-pointer" : undefined}
        onClick={() => hasDetails && setOpen(!open)}
      >
        <TableCell className="py-3 pl-4 pr-2">
          {hasDetails ? (
            <ChevronRight
              className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
            />
          ) : null}
        </TableCell>
        <TableCell className="py-3 pl-0 pr-3">
          <Badge
            variant={SEVERITY_BADGE[issue.severity].variant}
            className={`gap-1 px-2 text-[0.6875rem] ${SEVERITY_BADGE[issue.severity].className}`}
          >
            {severityIcon(issue.severity)}
            {issue.severity}
          </Badge>
        </TableCell>
        <TableCell className="py-3 pl-0 pr-3">
          <div>
            <p className="font-medium text-sm leading-snug">{issue.title}</p>
            {issue.displayValue ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {issue.displayValue}
              </p>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="hidden py-3 pl-0 pr-3 sm:table-cell">
          <span className="text-xs text-muted-foreground">
            {issue.category}
          </span>
        </TableCell>
        <TableCell className="hidden py-3 pl-0 pr-3 text-right md:table-cell">
          {issue.impactMs != null || issue.impactBytes != null ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {issue.impactMs ? formatMs(issue.impactMs) : null}
              {issue.impactMs && issue.impactBytes ? " / " : null}
              {issue.impactBytes ? formatBytes(issue.impactBytes) : null}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="py-3 pl-0 pr-4 text-right">
          {issue.score != null ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {issue.score}
            </span>
          ) : null}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="pb-4 pt-2 pl-[8.5rem] pr-4">
            <div className="space-y-3">
              {issue.description ? (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {renderInlineMarkdown(issue.description)}
                </div>
              ) : null}
              {issue.items.length > 0 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground text-xs">
                    Affected items ({issue.items.length})
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {issue.items.map((item, itemIndex) => (
                      <pre
                        key={`${issue.auditKey}-${itemIndex}`}
                        className="bg-muted/60 p-2 rounded overflow-x-auto text-xs leading-relaxed"
                      >
                        {item}
                      </pre>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
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
        className="underline underline-offset-4 text-link inline-flex items-center gap-1"
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

// Halo has no info badge, so info keeps the neutral badge with the info text.
const SEVERITY_BADGE: Record<
  "critical" | "warning" | "info",
  { variant: BadgeProps["variant"]; className: string }
> = {
  critical: { variant: "destructive", className: "" },
  warning: { variant: "warning", className: "" },
  info: { variant: "secondary", className: "text-info" },
};

function severityIcon(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return <FileWarning className="size-3" />;
  if (severity === "warning") return <TriangleAlert className="size-3" />;
  return <Info className="size-3" />;
}
