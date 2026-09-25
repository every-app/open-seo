import { Link } from "@tanstack/react-router";
import { Trash2 } from "@/client/components/icons";
import { PortalMenu } from "@/client/components/PortalMenu";
import { formatCreatedBy } from "@/client/features/reports/shared";
import { formatRelativeTime } from "@/client/lib/relative-time";
import type { ReportListItem } from "@/serverFunctions/reports";
import { REPORT_APP_LIST_LIMIT } from "@/types/schemas/reports";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";

export function ReportsList({
  projectId,
  reports,
  onDelete,
}: {
  projectId: string;
  reports: ReportListItem[];
  onDelete: (report: ReportListItem) => void;
}) {
  if (reports.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No reports yet. Run an OpenSEO skill such as seo-audit from Claude Code
        or Codex and the report will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Created by</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell className="max-w-[26.25rem]">
                <Link
                  to="/p/$projectId/reports/$reportId"
                  params={{ projectId, reportId: report.id }}
                  className="underline-offset-4 no-underline hover:underline font-medium"
                >
                  {report.title}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatCreatedBy(report)}
              </TableCell>
              {/* The template the report was written from, else the skill
                  that produced it: what a reader needs to tell two reports
                  on the same site apart. */}
              <TableCell className="text-muted-foreground">
                {report.templateName ?? report.skill ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatRelativeTime(report.updatedAt)}
              </TableCell>
              <TableCell className="w-10 text-right">
                <PortalMenu ariaLabel={`Actions for ${report.title}`}>
                  {(close) => (
                    <DropdownMenuItem
                      className="text-negative"
                      onClick={() => {
                        close();
                        onDelete(report);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </PortalMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {reports.length === REPORT_APP_LIST_LIMIT ? (
        <p className="text-xs text-muted-foreground">
          Showing the {REPORT_APP_LIST_LIMIT} most recent reports.
        </p>
      ) : null}
    </div>
  );
}
