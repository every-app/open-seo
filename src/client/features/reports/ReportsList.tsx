import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { PortalMenu } from "@/client/components/PortalMenu";
import { formatCreatedBy } from "@/client/features/reports/shared";
import { formatRelativeTime } from "@/client/lib/relative-time";
import type { ReportListItem } from "@/serverFunctions/reports";
import { REPORT_APP_LIST_LIMIT } from "@/types/schemas/reports";

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
      <p className="rounded-lg border border-dashed border-base-300 px-4 py-6 text-sm text-base-content/60">
        No reports yet. Run an OpenSEO skill such as seo-audit from Claude Code
        or Codex and the report will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Title</th>
              <th>Created by</th>
              <th>Type</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-base-200">
                <td className="max-w-[420px]">
                  <Link
                    to="/p/$projectId/reports/$reportId"
                    params={{ projectId, reportId: report.id }}
                    className="link link-hover font-medium"
                  >
                    {report.title}
                  </Link>
                </td>
                <td className="text-base-content/70">
                  {formatCreatedBy(report)}
                </td>
                {/* The template the report was written from, else the skill
                    that produced it: what a reader needs to tell two reports
                    on the same site apart. */}
                <td className="text-base-content/70">
                  {report.templateName ?? report.skill ?? "—"}
                </td>
                <td className="whitespace-nowrap text-base-content/70">
                  {formatRelativeTime(report.updatedAt)}
                </td>
                <td className="w-10 text-right">
                  <PortalMenu ariaLabel={`Actions for ${report.title}`}>
                    {(close) => (
                      <li>
                        <button
                          className="text-error"
                          onClick={() => {
                            close();
                            onDelete(report);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      </li>
                    )}
                  </PortalMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reports.length === REPORT_APP_LIST_LIMIT ? (
        <p className="text-xs text-base-content/60">
          Showing the {REPORT_APP_LIST_LIMIT} most recent reports.
        </p>
      ) : null}
    </div>
  );
}
