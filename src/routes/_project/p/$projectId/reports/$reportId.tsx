import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  FileDown,
  Globe,
  Lock,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { z } from "zod";
import { PortalMenu } from "@/client/components/PortalMenu";
import { ReportViewer } from "@/client/features/reports/ReportViewer";
import {
  DeleteReportModal,
  formatCreatedBy,
  reportQueryKey,
  ShareReportModal,
  useDeleteReport,
} from "@/client/features/reports/shared";
import { formatRelativeTime } from "@/client/lib/relative-time";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { getReport } from "@/serverFunctions/reports";

// Expand lives in the URL, not in state, so a refresh (or a link someone
// pasted) comes back expanded.
const reportDetailSearchSchema = z.object({ full: z.boolean().optional() });

export const Route = createFileRoute(
  "/_project/p/$projectId/reports/$reportId",
)({
  validateSearch: reportDetailSearchSchema,
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { projectId, reportId } = Route.useParams();
  const hosted = isHostedClientAuthMode();
  const { full } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [showDelete, setShowDelete] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const openedRef = useRef<string | null>(null);
  const exitRef = useRef<HTMLButtonElement>(null);

  const reportQuery = useQuery({
    queryKey: reportQueryKey(projectId, reportId),
    queryFn: () => getReport({ data: { projectId, reportId } }),
    // The report may have been replaced by an agent seconds ago; the app-wide
    // 5-minute staleTime would show the previous metadata as current.
    staleTime: 0,
    // A deleted report is a NOT_FOUND, not a flake; retrying it only delays the
    // not-found copy by several seconds.
    retry: false,
  });
  const report = reportQuery.data;

  const deleteMutation = useDeleteReport(projectId, () => {
    setShowDelete(false);
    // `replace`, so Back does not return to the deleted report's URL.
    void navigate({
      to: "/p/$projectId/reports",
      params: { projectId },
      replace: true,
    });
  });

  // useCallback so the Esc listener below is not re-registered every render.
  const setExpanded = useCallback(
    (expanded: boolean) => {
      void navigate({
        search: () => (expanded ? { full: true } : {}),
        replace: true,
      });
    },
    [navigate],
  );

  // One open event per report, once its metadata (and so its skill) is known.
  useEffect(() => {
    if (!report || openedRef.current === report.id) return;
    openedRef.current = report.id;
    captureClientEvent("report:opened", {
      project_id: projectId,
      report_id: report.id,
      skill: report.skill,
    });
  }, [projectId, report]);

  // Esc leaves the expanded view, the same key Modal.tsx uses to close. The
  // listener is on the parent window, and the expanded body is almost entirely
  // the sandboxed iframe: one click inside moves focus into the frame, which
  // has no scripts and so cannot forward the key. Focusing Exit on entry keeps
  // Esc working until the reader clicks into the report; Exit is the
  // guaranteed path.
  useEffect(() => {
    if (!full) return;
    exitRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [full, setExpanded]);

  if (reportQuery.isPending) {
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="alert alert-error">
            <span className="text-sm">
              {/* A deleted report and another project's report are the
                  same answer on purpose, so ids cannot be probed. */}
              {getErrorCode(reportQuery.error) === "NOT_FOUND"
                ? "This report does not exist or you do not have access to it."
                : getStandardErrorMessage(
                    reportQuery.error,
                    "Failed to load the report",
                  )}
            </span>
          </div>
          <Link
            to="/p/$projectId/reports"
            params={{ projectId }}
            className="btn btn-ghost btn-sm"
          >
            &larr; Back to reports
          </Link>
        </div>
      </div>
    );
  }

  // `?print=1` serves the same document with a print() script appended, so the
  // new tab opens the print dialog itself.
  const exportPdf = () => {
    captureClientEvent("report:exported_pdf", {
      project_id: projectId,
      report_id: report.id,
    });
    window.open(`/r/${report.id}?print=1`, "_blank", "noopener");
  };

  if (full) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-base-100">
        <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-2">
          <span className="truncate text-sm font-medium">{report.title}</span>
          <button
            type="button"
            ref={exitRef}
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={() => setExpanded(false)}
          >
            <Minimize2 className="size-4" />
            Exit
          </button>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <ReportViewer
            src={`/r/${report.id}`}
            title={report.title}
            className="h-full w-full bg-base-100"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 py-4 md:px-6 md:py-6">
      <div className="space-y-3">
        <Link
          to="/p/$projectId/reports"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-sm text-base-content/60 transition-colors hover:text-base-content"
        >
          <ChevronLeft className="size-4" />
          Reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{report.title}</h1>
            <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-base-content/50">Created by</dt>
                <dd>{formatCreatedBy(report)}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-base-content/50">Type</dt>
                {/* As in the list's Type column: the template name when the
                    report followed one, else the skill, else an em dash. */}
                <dd>{report.templateName ?? report.skill ?? "—"}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-base-content/50">Updated</dt>
                <dd title={new Date(report.updatedAt).toLocaleString()}>
                  {formatRelativeTime(report.updatedAt)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Share links are hosted-only (see shareAccess.ts), so a
                self-hosted deployment keeps Export as its primary action
                rather than offering a button the server would refuse. The
                icon carries the state: a globe once a public link is live, a
                lock while only members can open it. */}
            {hosted ? (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() => setShowShare(true)}
              >
                {report.shareToken ? (
                  <Globe className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
                Share
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={exportPdf}
              >
                <FileDown className="size-4" />
                Export
              </button>
            )}
            <PortalMenu
              ariaLabel="Report actions"
              triggerClassName="btn btn-ghost btn-sm btn-square"
              triggerContent={<MoreHorizontal className="size-4" />}
              menuClassName="w-52"
            >
              {(close) => (
                <>
                  {hosted ? (
                    <li>
                      <button
                        onClick={() => {
                          close();
                          exportPdf();
                        }}
                      >
                        <FileDown className="size-4" />
                        Export
                      </button>
                    </li>
                  ) : null}
                  <li>
                    <button
                      onClick={() => {
                        close();
                        setExpanded(true);
                      }}
                    >
                      <Maximize2 className="size-4" />
                      Full screen
                    </button>
                  </li>
                  <li>
                    <a
                      href={`/r/${report.id}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={close}
                    >
                      <ExternalLink className="size-4" />
                      Open in new tab
                    </a>
                  </li>
                  <li role="separator" className="mx-1 my-1 h-px bg-base-300" />
                  <li>
                    <button
                      className="text-error"
                      onClick={() => {
                        close();
                        setShowDelete(true);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </button>
                  </li>
                </>
              )}
            </PortalMenu>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ReportViewer src={`/r/${report.id}`} title={report.title} />
      </div>

      {hosted && showShare ? (
        <ShareReportModal report={report} onClose={() => setShowShare(false)} />
      ) : null}

      {showDelete ? (
        <DeleteReportModal
          title={report.title}
          isPending={deleteMutation.isPending}
          onClose={() => setShowDelete(false)}
          onConfirm={() => deleteMutation.mutate(report.id)}
        />
      ) : null}
    </div>
  );
}
