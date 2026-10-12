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
} from "lucide-react";
import {
  getRankTrackingConfigSummaries,
  updateRankTrackingConfig,
} from "@/serverFunctions/rank-tracking";
import { devicesLabel, scheduleLabel } from "@/shared/rank-tracking";
import { formatNextCheck } from "./scheduleTime";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  applyDomainListFilters,
  countActiveDomainListFilters,
  DomainListFilterBar,
  getDomainListFilterOptions,
  type DomainListFilters,
} from "./RankTrackingFilters";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useDebouncedDraft } from "@/client/hooks/useDebouncedDraft";
import type { RankTrackingListSearch } from "@/types/schemas/rank-tracking-search";
import { QueryError } from "@/client/components/QueryState";

type ConfigSummary = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

// Below this many domains the list is short enough to scan by eye, so the
// filter controls are more chrome than help. Still shown if filters are active
// (e.g. archiving dropped the count) so they never get orphaned.
const FILTER_BAR_MIN_DOMAINS = 6;

export function RankTrackingDomainList({
  projectId,
  search,
  onSearchChange,
  onAddDomain,
}: {
  projectId: string;
  search: RankTrackingListSearch;
  onSearchChange: (next: RankTrackingListSearch) => void;
  onAddDomain: () => void;
}) {
  const queryClient = useQueryClient();
  const [archiveTarget, setArchiveTarget] = useState<ConfigSummary | null>(
    null,
  );
  const [query, setQuery] = useDebouncedDraft(search.q ?? "", (q) =>
    onSearchChange({ ...search, q: q || undefined }),
  );
  const filters: DomainListFilters = {
    query,
    device: search.device ?? "all",
    locationCode: search.loc ? String(search.loc) : "all",
  };
  const setFilters = (next: DomainListFilters) => {
    setQuery(next.query);
    if (
      next.device === filters.device &&
      next.locationCode === filters.locationCode
    ) {
      return;
    }
    // Carry the typed query too, so the navigation does not revert it.
    onSearchChange({
      q: next.query || undefined,
      device: next.device === "all" ? undefined : next.device,
      loc: next.locationCode === "all" ? undefined : Number(next.locationCode),
    });
  };
  const clearFilters = () => {
    setQuery("");
    onSearchChange({});
  };
  const summariesQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });
  const summaries = summariesQuery.data;
  const allSummaries = useMemo(() => summaries ?? [], [summaries]);
  const filteredSummaries = applyDomainListFilters(allSummaries, filters);
  const filterOptions = useMemo(() => {
    const options = getDomainListFilterOptions(allSummaries);
    // A shared link can filter on a value no tracked domain has. Show it so
    // the select matches the URL.
    const { device, loc } = search;
    if (device && !options.devices.some((o) => o.value === device)) {
      options.devices.push({ value: device, label: devicesLabel(device) });
    }
    if (loc && !options.locations.some((o) => o.value === String(loc))) {
      options.locations.push({
        value: String(loc),
        label: LOCATIONS[loc] ?? String(loc),
      });
    }
    return options;
  }, [allSummaries, search]);
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
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-3">
        <CardTitle>
          <h2 className="text-sm font-semibold">Tracked Domains</h2>
        </CardTitle>
        <CardAction className="self-center">
          <Button size="sm" onClick={onAddDomain}>
            <Plus data-icon="inline-start" />
            Add Domain
          </Button>
        </CardAction>
      </CardHeader>
      {(allSummaries.length >= FILTER_BAR_MIN_DOMAINS ||
        activeFilterCount > 0) && (
        <DomainListFilterBar
          filters={filters}
          options={filterOptions}
          activeFilterCount={activeFilterCount}
          onChange={setFilters}
          onReset={clearFilters}
        />
      )}
      <div className="divide-y divide-border border-t border-border">
        {summariesQuery.isError && (
          <div className="px-5 py-4">
            <QueryError
              error={summariesQuery.error}
              fallback="Failed to load tracked domains"
              onRetry={() => void summariesQuery.refetch()}
              isRetrying={summariesQuery.isFetching}
            />
          </div>
        )}
        {summariesQuery.isPending ? (
          <div className="space-y-4 px-5 py-4" aria-busy>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
            ))}
          </div>
        ) : !summaries ? null : summaries.length === 0 ? (
          <EmptyState
            variant="plain"
            icon={Globe}
            title="No tracked domains yet"
            description="Add a domain to start monitoring keyword rankings over time."
          />
        ) : filteredSummaries.length === 0 ? (
          <EmptyState
            variant="plain"
            kind="filtered"
            title="No matching tracked domains"
            description="Try clearing search or adjusting filters."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
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

      {archiveTarget && (
        <ConfirmDialog
          title={`Archive ${archiveTarget.domain}?`}
          confirmLabel="Archive"
          destructive
          pending={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
          onClose={() => setArchiveTarget(null)}
        >
          Scheduled checks will stop and this domain will be hidden from the
          list. Ranking history is preserved.
        </ConfirmDialog>
      )}
    </Card>
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
    <div className="relative flex w-full items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]">
      <Link
        to="/p/$projectId/rank-tracking/$configId"
        params={{ projectId, configId: summary.id }}
        className="absolute inset-0 z-0"
        aria-label={`Open ${summary.domain}`}
      />
      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="font-medium truncate">{summary.domain}</p>
        <p className="text-xs text-muted-foreground">
          {summary.locationName
            ? formatLocationLabel(summary.locationName, 2)
            : (LOCATIONS[summary.locationCode] ?? "US")}{" "}
          &middot; {devicesLabel(summary.devices)} &middot;{" "}
          {scheduleLabel(summary.scheduleInterval)}
          {summary.scheduleInterval !== "manual" && summary.nextCheckAt && (
            <> &middot; Next: {formatNextCheck(summary.nextCheckAt)}</>
          )}
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
        {summary.lastSkipReason === "plan_required" && (
          <p className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3" />
            Scheduled check skipped — paid plan required
          </p>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-6 text-sm pointer-events-none">
        {summary.keywordCount > 0 && (
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Keywords
            </p>
            <p className="font-mono font-medium">{summary.keywordCount}</p>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="relative z-10 text-muted-foreground hover:text-destructive"
        title="Archive domain"
        aria-label={`Archive ${summary.domain}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onArchive();
        }}
      >
        <Archive className="size-4" />
      </Button>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
    </div>
  );
}
