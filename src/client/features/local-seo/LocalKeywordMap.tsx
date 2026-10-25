import { useQuery } from "@tanstack/react-query";
import {
  getLocalScan,
  type getLocalTracker,
} from "@/serverFunctions/local-seo";
import { QueryError } from "@/client/components/QueryState";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import {
  buildLocalGrid,
  isLocalScanActive,
  LocalPointStatus,
} from "@/shared/local-seo";
import { LocalRankGrid, type LocalGridDisplayPoint } from "./LocalRankGrid";
import { LocalPointResults } from "./LocalPointResults";
import type { LocalSeoSearch } from "@/types/schemas/local-seo-search";

type TrackerData = Awaited<ReturnType<typeof getLocalTracker>>;

export function LocalKeywordMap({
  projectId,
  tracker,
  keyword,
  selectedScan,
  historical,
  search,
  onSearchChange,
}: {
  projectId: string;
  tracker: TrackerData["tracker"];
  keyword: TrackerData["keywords"][number];
  selectedScan: TrackerData["scans"][number] | undefined;
  historical: boolean;
  search: LocalSeoSearch;
  onSearchChange: (search: LocalSeoSearch) => void;
}) {
  const query = useQuery({
    queryKey: ["localSeo", projectId, "scan", selectedScan?.id],
    queryFn: () =>
      getLocalScan({ data: { projectId, scanId: selectedScan!.id } }),
    enabled: Boolean(selectedScan),
    refetchInterval: (state) =>
      state.state.data && isLocalScanActive(state.state.data.scan.status)
        ? 4000
        : false,
  });
  const data = query.data;
  const points: LocalGridDisplayPoint[] =
    data?.points ??
    buildLocalGrid(tracker, tracker.gridSize, tracker.spacingKm).map(
      (point) => ({
        ...point,
        id: `${point.row}-${point.col}`,
        status: LocalPointStatus.Pending,
        rank: null,
        resultsCount: null,
      }),
    );
  const point =
    points.find((row) => row.id === search.point) ??
    points[Math.floor(points.length / 2)];
  return (
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{keyword.keyword}</h3>
          <p className="text-xs text-muted-foreground">
            {selectedScan
              ? `${historical ? "Saved check" : "Latest check"} · ${new Date(selectedScan.createdAt).toLocaleString()}`
              : "Grid preview"}
          </p>
        </div>
        {historical && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSearchChange({ keyword: keyword.id })}
          >
            Back to latest
          </Button>
        )}
      </div>
      {data?.scan.error && <QueryError fallback={data.scan.error} />}
      {query.isError && (
        <QueryError
          error={query.error}
          fallback="Failed to load ranking results."
          onRetry={() => void query.refetch()}
        />
      )}
      <div className="grid auto-rows-[22rem] gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <LocalRankGrid
          projectId={projectId}
          points={points}
          selectedPointId={point?.id}
          preview={!data}
          onSelect={(pointId) => {
            if (selectedScan && data)
              onSearchChange({
                ...search,
                keyword: keyword.id,
                scan: selectedScan.id,
                point: pointId,
              });
          }}
        />
        {data && selectedScan && point ? (
          <LocalPointResults
            point={point}
            results={data.results.filter(
              (result) => result.pointId === point.id,
            )}
            cid={tracker.cid}
            placeId={tracker.placeId}
          />
        ) : (
          <Card className="gap-0 py-0 shadow-none">
            <EmptyState
              variant="plain"
              title="Preview your coverage"
              description="Check rankings to see where this business appears for your tracked keywords. Select a point to see the businesses ranking there."
            />
          </Card>
        )}
      </div>
    </div>
  );
}
