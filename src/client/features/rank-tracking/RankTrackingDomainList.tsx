import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LOCATIONS } from "@/client/features/keywords/locations";
import {
  AlertTriangle,
  Archive,
  Globe,
  Plus,
  ChevronRight,
} from "lucide-react";
import {
  getRankTrackingConfigSummaries,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import {
  devicesLabel as getDevicesLabel,
  scheduleLabel as getScheduleLabel,
} from "@/shared/rank-tracking";
import { Modal } from "@/client/components/Modal";

type ConfigSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

export function RankTrackingDomainList({
  projectId,
  onAddDomain,
}: {
  projectId: string;
  onAddDomain: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [archiveTarget, setArchiveTarget] = useState<ConfigSummary | null>(
    null,
  );
  const { data: summaries } = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });

  const archiveMutation = useMutation({
    mutationFn: (configId: string) =>
      updateRankTrackingConfig({
        data: { projectId, configId, isActive: false },
      }),
    onSuccess: () => {
      setArchiveTarget(null);
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigSummaries", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigs", projectId],
      });
      toast.success("Domain archived");
    },
  });

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-0 p-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Tracked Domains</h2>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={onAddDomain}
          >
            <Plus className="size-3.5" />
            Add Domain
          </button>
        </div>
        <div className="divide-y divide-base-300">
          {(summaries ?? []).length === 0 ? (
            <div className="px-5 py-10 text-center space-y-2">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-base-200">
                <Globe className="size-5 text-base-content/40" />
              </div>
              <p className="text-sm font-medium text-base-content/70">
                No tracked domains yet
              </p>
              <p className="text-xs text-base-content/40">
                Add a domain to start monitoring keyword rankings over time.
              </p>
            </div>
          ) : (
            (summaries ?? []).map((summary) => (
              <DomainRow
                key={summary.id}
                summary={summary}
                onClick={() =>
                  void navigate({
                    to: "/p/$projectId/rank-tracking/$configId",
                    params: { projectId, configId: summary.id },
                  })
                }
                onArchive={() => setArchiveTarget(summary)}
              />
            ))
          )}
        </div>
      </div>

      {archiveTarget && (
        <Modal>
          <h3 className="text-lg font-semibold">
            Archive {archiveTarget.domain}?
          </h3>
          <p className="text-sm text-base-content/70">
            Scheduled checks will stop and this domain will be hidden from the
            list. Ranking history is preserved.
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setArchiveTarget(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-error btn-sm gap-1"
              onClick={() => archiveMutation.mutate(archiveTarget.id)}
              disabled={archiveMutation.isPending}
            >
              <Archive className="size-3.5" />
              Archive
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DomainRow({
  summary,
  onClick,
  onArchive,
}: {
  summary: ConfigSummary;
  onClick: () => void;
  onArchive: () => void;
}) {
  const dl = getDevicesLabel(summary.devices);
  const sl = getScheduleLabel(summary.scheduleInterval);

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-base-200/50 cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{summary.domain}</p>
        <p className="text-xs text-base-content/60">
          {LOCATIONS[summary.locationCode] ?? "US"} &middot; {dl} &middot; {sl}
          {summary.lastRunCompletedAt && (
            <>
              {" "}
              &middot; Last:{" "}
              {new Date(summary.lastRunCompletedAt).toLocaleDateString()}
            </>
          )}
        </p>
        {summary.lastSkipReason === "insufficient_credits" && (
          <p className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3" />
            Scheduled check skipped — insufficient credits
          </p>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-6 text-sm">
        {summary.keywordCount > 0 && (
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-base-content/60">
              Keywords
            </p>
            <p className="font-mono font-medium">{summary.keywordCount}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-xs text-base-content/40 hover:text-error"
        title="Archive domain"
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
      >
        <Archive className="size-4" />
      </button>
      <ChevronRight className="size-4 shrink-0 text-base-content/40" />
    </div>
  );
}
