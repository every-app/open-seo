import { useQuery } from "@tanstack/react-query";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { AlertTriangle, Globe, Plus, ChevronRight } from "lucide-react";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";
import {
  devicesLabel as getDevicesLabel,
  scheduleLabel as getScheduleLabel,
} from "@/shared/rank-tracking";

type ConfigSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

export function RankTrackingDomainList({
  projectId,
  onSelectConfig,
  onAddDomain,
}: {
  projectId: string;
  onSelectConfig: (configId: string) => void;
  onAddDomain: () => void;
}) {
  const { data: summaries } = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-0 p-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Tracked Domains</h2>
          <button
            className="btn btn-primary btn-sm btn-outline gap-1"
            onClick={onAddDomain}
          >
            <Plus className="size-3.5" />
            Add Domain
          </button>
        </div>
        <div className="divide-y divide-base-300">
          {(summaries ?? []).map((summary) => (
            <DomainRow
              key={summary.id}
              summary={summary}
              onClick={() => onSelectConfig(summary.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainRow({
  summary,
  onClick,
}: {
  summary: ConfigSummary;
  onClick: () => void;
}) {
  const dl = getDevicesLabel(summary.devices);
  const sl = getScheduleLabel(summary.scheduleInterval);

  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-base-200/50"
      onClick={onClick}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-base-200">
        <Globe className="size-4 text-base-content/60" />
      </div>
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
      <ChevronRight className="size-4 shrink-0 text-base-content/40" />
    </button>
  );
}
