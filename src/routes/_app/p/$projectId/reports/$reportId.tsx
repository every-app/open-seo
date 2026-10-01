import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
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
import { getErrorCode } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { getReport } from "@/serverFunctions/reports";
import { appPath } from "@/shared/app-path";

// Expand lives in the URL, not in state, so a refresh (or a link someone
// pasted) comes back expanded.
const reportDetailSearchSchema = z.object({ full: z.boolean().optional() });

export const Route = createFileRoute("/_app/p/$projectId/reports/$reportId")({
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
  const deleteMutation = useDeleteReport(projectId, () => {
    setShowDelete(false);
    // `replace`, so Back does not return to the deleted report's URL.
    void navigate({
      to: "/p/$projectId/reports",
      params: { projectId },
      replace: true,
    });
  });

  // useCallback so the full-screen Esc listener is not re-registered (and
  // Exit re-focused) every render.
  const exitFullScreen = useCallback(() => {
    void navigate({ search: () => ({}), replace: true });
  }, [navigate]);

  // One open event per report, once its metadata (and so its skill) is known.
  const loadedReport = reportQuery.data;
  useEffect(() => {
    if (!loadedReport || openedRef.current === loadedReport.id) return;
    openedRef.current = loadedReport.id;
    captureClientEvent("report:opened", {
      project_id: projectId,
      report_id: loadedReport.id,
      skill: loadedReport.skill,
    });
  }, [projectId, loadedReport]);

  if (reportQuery.isPending) {
    return <SkeletonPage />;
  }

  const loadError = {
    error: reportQuery.error,
    fallback: "Failed to load the report",
    onRetry: () => void reportQuery.refetch(),
    isRetrying: reportQuery.isFetching,
  };

  // A failed refetch keeps the loaded report on screen, unless the report is
  // gone: then the not-found answer replaces it.
  const notFound =
    reportQuery.isError && getErrorCode(reportQuery.error) === "NOT_FOUND";
  if (notFound || reportQuery.data === undefined) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <BackLink to="/p/$projectId/reports" params={{ projectId }}>
            Reports
          </BackLink>
          {/* A deleted report and another project's report are the same
              answer on purpose, so ids cannot be probed. Retrying either
              cannot help. */}
          {notFound ? (
            <QueryError
              variant="page"
              title="Report not found"
              fallback="This report does not exist or you do not have access to it."
            />
          ) : (
            <QueryError
              variant="page"
              title="Couldn't load the report"
              {...loadError}
            />
          )}
        </div>
      </div>
    );
  }

  const report = reportQuery.data;

  // `?print=1` serves the same document with a print() script appended, so the
  // new tab opens the print dialog itself.
  const exportPdf = () => {
    captureClientEvent("report:exported_pdf", {
      project_id: projectId,
      report_id: report.id,
    });
    window.open(`${appPath(`/r/${report.id}`)}?print=1`, "_blank", "noopener");
  };

  if (full) {
    return (
      <FullScreenReport
        reportId={report.id}
        title={report.title}
        onExit={exitFullScreen}
      />
    );
  }

  // The max width includes the padding here, so it adds the padding back to
  // keep the content as wide as the other pages (max-w-7xl).
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[calc(var(--container-7xl)+2rem)] flex-col gap-3 px-4 py-4 md:max-w-[calc(var(--container-7xl)+3rem)] md:px-6 md:py-6">
      <PageHeader
        backLink={
          <BackLink to="/p/$projectId/reports" params={{ projectId }}>
            Reports
          </BackLink>
        }
        title={report.title}
        description={
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-foreground">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Created by</dt>
              <dd>{formatCreatedBy(report)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Type</dt>
              {/* As in the list's Type column: the template name when the
                    report followed one, else the skill, else an em dash. */}
              <dd>{report.templateName ?? report.skill ?? "—"}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">Updated</dt>
              <dd title={new Date(report.updatedAt).toLocaleString()}>
                {formatRelativeTime(report.updatedAt)}
              </dd>
            </div>
          </dl>
        }
        actions={
          <>
            {/* Share links are hosted-only (see shareAccess.ts), so a
                self-hosted deployment keeps Export as its primary action
                rather than offering a button the server would refuse. The
                icon carries the state: a globe once a public link is live, a
                lock while only members can open it. */}
            {hosted ? (
              <Button onClick={() => setShowShare(true)}>
                {report.shareToken ? (
                  <Globe data-icon="inline-start" />
                ) : (
                  <Lock data-icon="inline-start" />
                )}
                Share
              </Button>
            ) : (
              <Button onClick={exportPdf}>
                <FileDown data-icon="inline-start" />
                Export
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Report actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {hosted ? (
                  <>
                    <DropdownMenuItem onClick={exportPdf}>
                      <FileDown />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {reportQuery.isError ? <QueryError {...loadError} /> : null}

      <div className="relative min-h-0 flex-1">
        {/* View controls float over the top-right corner of the report frame.
            They belong to the viewer, not the document, so they overlay the
            iframe instead of being injected into it. Placed before the iframe
            so keyboard focus reaches them without tabbing through the report;
            inset from the edge so they clear a classic scrollbar. z-10 keeps
            them above the viewer, which is positioned and comes later. */}
        <div className="absolute top-1 right-5 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Full screen"
            title="Full screen"
            onClick={() =>
              void navigate({ search: () => ({ full: true }), replace: true })
            }
          >
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            aria-label="Open in new tab"
            title="Open in new tab"
            render={
              <a
                href={appPath(`/r/${report.id}`)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink />
          </Button>
        </div>
        <ReportViewer src={appPath(`/r/${report.id}`)} title={report.title} />
      </div>

      {showShare ? (
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

// Esc leaves the expanded view, the same key Modal.tsx uses to close. The
// listener is on the parent window, and the expanded body is almost entirely
// the sandboxed iframe: one click inside moves focus into the frame, which has
// no scripts and so cannot forward the key. Focusing Exit on entry keeps Esc
// working until the reader clicks into the report; Exit is the guaranteed
// path.
function FullScreenReport({
  reportId,
  title,
  onExit,
}: {
  reportId: string;
  title: string;
  onExit: () => void;
}) {
  const exitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    exitRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="truncate text-sm font-medium">{title}</span>
        <Button ref={exitRef} variant="ghost" onClick={onExit}>
          <Minimize2 data-icon="inline-start" />
          Exit
        </Button>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ReportViewer
          src={appPath(`/r/${reportId}`)}
          title={title}
          className="h-full w-full bg-background"
        />
      </div>
    </div>
  );
}
