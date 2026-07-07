import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { LOCATIONS } from "@/client/features/keywords/locations";
import {
  AlertTriangle,
  Archive,
  Globe,
  Plus,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  getRankTrackingConfigSummaries,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { Modal } from "@/client/components/Modal";
import {
  applyDomainListFilters,
  countActiveDomainListFilters,
  DomainListFilterBar,
  EMPTY_DOMAIN_LIST_FILTERS,
  getDomainListFilterOptions,
  type DomainListFilters,
} from "./RankTrackingFilters";

type ConfigSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

// Below this many domains the list is short enough to scan by eye, so the
// filter controls are more chrome than help. Still shown if filters are active
// (e.g. archiving dropped the count) so they never get orphaned.
const FILTER_BAR_MIN_DOMAINS = 6;

export function RankTrackingDomainList({
  projectId,
  onAddDomain,
}: {
  projectId: string;
  onAddDomain: () => void;
}) {
  const queryClient = useQueryClient();
  const [archiveTarget, setArchiveTarget] = useState<ConfigSummary | null>(
    null,
  );
  const [filters, setFilters] = useState<DomainListFilters>(
    EMPTY_DOMAIN_LIST_FILTERS,
  );
  const { data: summaries } = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const allSummaries = useMemo(() => summaries ?? [], [summaries]);
  const filteredSummaries = useMemo(
    () => applyDomainListFilters(allSummaries, filters),
    [allSummaries, filters],
  );
  const filterOptions = useMemo(
    () => getDomainListFilterOptions(allSummaries),
    [allSummaries],
  );
  const activeFilterCount = countActiveDomainListFilters(filters);

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
        {(allSummaries.length >= FILTER_BAR_MIN_DOMAINS ||
          activeFilterCount > 0) && (
          <DomainListFilterBar
            filters={filters}
            options={filterOptions}
            activeFilterCount={activeFilterCount}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_DOMAIN_LIST_FILTERS)}
          />
        )}
        <div className="divide-y divide-base-300 border-t border-base-300">
          {allSummaries.length === 0 ? (
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
          ) : filteredSummaries.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-3">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-base-200">
                <Search className="size-5 text-base-content/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-base-content/70">
                  No matching tracked domains
                </p>
                <p className="text-xs text-base-content/40">
                  Try clearing search or adjusting filters.
                </p>
              </div>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setFilters(EMPTY_DOMAIN_LIST_FILTERS)}
                disabled={activeFilterCount === 0}
              >
                Clear filters
              </button>
            </div>
          ) : (
            filteredSummaries.map((summary) => (
              <DomainRow
                key={summary.id}
                projectId={projectId}
                summary={summary}
                onArchive={() => setArchiveTarget(summary)}
              />
            ))
          )}
        </div>
      </div>

      {archiveTarget && (
        <Modal
          onClose={() => setArchiveTarget(null)}
          labelledBy="archive-domain-title"
        >
          <h3 id="archive-domain-title" className="text-lg font-semibold">
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
  projectId,
  summary,
  onArchive,
}: {
  projectId: string;
  summary: ConfigSummary;
  onArchive: () => void;
}) {
  return (
    <div className="relative flex w-full items-center gap-4 px-5 py-3.5 transition-colors hover:bg-base-200/50">
      <Link
        to="/p/$projectId/rank-tracking/$configId"
        params={{ projectId, configId: summary.id }}
        className="absolute inset-0 z-0"
        aria-label={`Open ${summary.domain}`}
      />
      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="font-medium truncate">{summary.domain}</p>
        <p className="text-xs text-base-content/60">
          {summary.locationName
            ? formatLocationLabel(summary.locationName, 2)
            : (LOCATIONS[summary.locationCode] ?? "US")}{" "}
          &middot; {devicesLabel(summary.devices)} &middot;{" "}
          {scheduleLabel(summary.scheduleInterval)}
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
      <div className="hidden sm:flex items-center gap-6 text-sm pointer-events-none">
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
        className="btn btn-ghost btn-xs text-base-content/40 hover:text-error relative z-10"
        title="Archive domain"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onArchive();
        }}
      >
        <Archive className="size-4" />
      </button>
      <ChevronRight className="size-4 shrink-0 text-base-content/40 pointer-events-none" />
    </div>
  );
}
