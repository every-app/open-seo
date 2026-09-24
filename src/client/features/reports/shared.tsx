import { formatRelativeTime } from "@/client/lib/relative-time";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "@/client/components/ConfirmDeleteModal";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  deleteReport,
  shareReport,
  unshareReport,
  type ReportListItem,
} from "@/serverFunctions/reports";
import { sharePath } from "@/shared/report-share";

import { Button, buttonVariants } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Switch } from "@/client/components/ui/switch";
// Query keys for both reports pages. staleTime is 0 wherever these are used:
// the pages exist to inspect what an agent just wrote, so the app-wide
// five-minute staleTime would show a pre-save list as current.
export const reportsQueryKey = (projectId: string) =>
  ["reports", projectId] as const;

export const reportQueryKey = (projectId: string, reportId: string) =>
  ["report", projectId, reportId] as const;

/**
 * "Ben · Claude Code". The person is the half that means something (it comes
 * from the session); the client half is a self-reported hint, so it stands
 * alone when the user cannot be resolved.
 */
export function formatCreatedBy(report: ReportListItem): string {
  return report.createdByName
    ? `${report.createdByName} · ${report.createdBy}`
    : report.createdBy;
}

/**
 * One delete flow for both the list row and the detail page, so the toast, the
 * event and the invalidation cannot drift apart.
 */
export function useDeleteReport(projectId: string, onDeleted?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) =>
      deleteReport({ data: { projectId, reportId } }),
    onSuccess: (_result, reportId) => {
      captureClientEvent("report:deleted", {
        project_id: projectId,
        report_id: reportId,
      });
      toast.success("Report deleted");
      void queryClient.invalidateQueries({
        queryKey: reportsQueryKey(projectId),
      });
      // Drop the detail entry too, or a later visit to that URL renders the
      // deleted report from cache before the refetch turns it into a 404.
      queryClient.removeQueries({
        queryKey: reportQueryKey(projectId, reportId),
      });
      onDeleted?.();
    },
    onError: (error: Error) => {
      toast.error(
        getStandardErrorMessage(error, "Failed to delete the report"),
      );
    },
  });
}

/** Reports have no version history and no undo, so deletes are confirmed by name. */
export function DeleteReportModal({
  title,
  isPending,
  onClose,
  onConfirm,
}: {
  title: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDeleteModal
      title={`Delete \u201c${title}\u201d?`}
      detail="This cannot be undone."
      confirmLabel="Delete report"
      isPending={isPending}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The share toggle. The link is built from the browser's own origin, so the
 * same report shares correctly from app.openseo.so and from a self-hosted
 * hostname without the server knowing either.
 */
export function ShareReportModal({
  report,
  onClose,
}: {
  report: Pick<
    ReportListItem,
    "id" | "projectId" | "title" | "shareToken" | "sharedAt"
  >;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { projectId, id: reportId } = report;
  // Share and unshare in one mutation, keyed by the state the toggle is moving
  // to. The response is written straight into the report query so the modal
  // shows the new link without waiting for a refetch; the list is invalidated
  // because its rows carry the same metadata.
  const mutation = useMutation({
    mutationFn: (shared: boolean) =>
      shared
        ? shareReport({ data: { projectId, reportId } })
        : unshareReport({ data: { projectId, reportId } }),
    onSuccess: (result) => {
      // No client event here: the service already captures report:shared and
      // report:unshared server-side, and a second one would double the count.
      queryClient.setQueryData(
        reportQueryKey(projectId, reportId),
        (previous: ReportListItem | undefined) =>
          previous ? { ...previous, ...result } : previous,
      );
      void queryClient.invalidateQueries({
        queryKey: reportsQueryKey(projectId),
      });
    },
  });
  // The toggle follows the click while the mutation is in flight — a round
  // trip that leaves the switch sitting in its old position reads as broken.
  const shared = Boolean(report.shareToken);
  const url = report.shareToken
    ? `${window.location.origin}${sharePath(report.shareToken)}`
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard not available");
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="share-report-title"
      maxWidth="max-w-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="share-report-title" className="text-base font-semibold">
            Share
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {report.title}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="size-8 -mr-2 -mt-1"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <label className="flex cursor-pointer items-center justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Public link</span>
            <span className="block text-xs text-muted-foreground">
              {shared
                ? "Anyone with the link can view. No sign-in needed."
                : "Only members of your organization can open it. A link that was open can keep loading for up to a minute."}
            </span>
          </span>
          <Switch
            checked={mutation.isPending ? mutation.variables : shared}
            disabled={mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate(checked)}
          />
        </label>

        {shared ? (
          <div className="space-y-3 border-t border-border p-4">
            {/* The field wraps onto its own line when the row gets narrow, so
                the link stays readable on a phone instead of shrinking. */}
            <div className="flex flex-wrap items-stretch gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(event) => event.target.select()}
                className="min-w-0 flex-1 basis-64 text-sm h-8 text-sm"
              />
              <div className="ml-auto flex items-stretch">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open link"
                  title="Open"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "sm",
                    className: "rounded-r-none border border-r-0 border-border",
                  })}
                >
                  <ExternalLink className="size-4" />
                </a>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-l-none"
                >
                  <Copy className="size-4" />
                  Copy link
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Shows the latest saved version. Hidden from search engines.
              {report.sharedAt
                ? ` Link created ${formatRelativeTime(report.sharedAt)}.`
                : ""}
            </p>
          </div>
        ) : null}
      </div>

      {/* Shown in place rather than as a toast: the message belongs next to
          the toggle that would not move. */}
      {mutation.isError ? (
        <p className="text-sm text-destructive">
          {getStandardErrorMessage(mutation.error, "Failed to update sharing")}
        </p>
      ) : null}
    </Modal>
  );
}
