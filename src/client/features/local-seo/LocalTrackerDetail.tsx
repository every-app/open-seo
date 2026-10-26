import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, List, Pencil, Play } from "lucide-react";
import { getLocalTracker, startLocalCheck } from "@/serverFunctions/local-seo";
import { QueryError, QueryState } from "@/client/components/QueryState";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { isLocalScanActive, LocalScanStatus } from "@/shared/local-seo";
import { LocalKeywordMap } from "./LocalKeywordMap";
import { LocalKeywordsDialog } from "./LocalKeywordsDialog";
import { LocalKeywordsTable, latestKeywordScan } from "./LocalKeywordsTable";
import type { LocalSeoSearch } from "@/types/schemas/local-seo-search";

type TrackerData = Awaited<ReturnType<typeof getLocalTracker>>;

export function LocalTrackerDetail({
  projectId,
  trackerId,
  search,
  onSearchChange,
}: {
  projectId: string;
  trackerId: string;
  search: LocalSeoSearch;
  onSearchChange: (search: LocalSeoSearch) => void;
}) {
  const query = useQuery({
    queryKey: ["localSeo", projectId, "tracker", trackerId],
    queryFn: () => getLocalTracker({ data: { projectId, trackerId } }),
    refetchInterval: (state) =>
      state.state.data?.checks.some((check) => isLocalScanActive(check.status))
        ? 4000
        : false,
  });
  return (
    <QueryState query={query} errorFallback="Failed to load local tracking">
      {(data) => (
        <TrackerContent
          projectId={projectId}
          data={data}
          search={search}
          onSearchChange={onSearchChange}
        />
      )}
    </QueryState>
  );
}

function TrackerContent({
  projectId,
  data,
  search,
  onSearchChange,
}: {
  projectId: string;
  data: TrackerData;
  search: LocalSeoSearch;
  onSearchChange: (search: LocalSeoSearch) => void;
}) {
  const { tracker, keywords, checks, scans, estimate } = data;
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [managingKeywords, setManagingKeywords] = useState(false);
  const keyword =
    keywords.find((row) => row.id === search.keyword) ?? keywords[0];
  const latestScan = keyword && latestKeywordScan(scans, keyword.id);
  const selectedScan =
    scans.find(
      (scan) => scan.keywordId === keyword?.id && scan.id === search.scan,
    ) ?? latestScan;
  const start = useMutation({
    mutationFn: (requestId: string) =>
      startLocalCheck({
        data: {
          projectId,
          trackerId: tracker.id,
          requestId,
          maxCostCredits: estimate.costCredits,
        },
      }),
    onSuccess: async () => {
      setConfirm(null);
      onSearchChange({ keyword: keyword?.id });
      await queryClient.invalidateQueries({
        queryKey: ["localSeo", projectId],
      });
    },
  });
  const active = checks.find((check) => isLocalScanActive(check.status));
  // Latest falls back to each keyword's newest results, so say when the map
  // shows an older check because the newest one returned none.
  const failed =
    checks[0]?.status === LocalScanStatus.Failed &&
    selectedScan?.checkId !== checks[0].id &&
    checks[0];
  const historyAvailable =
    checks.filter((check) => !isLocalScanActive(check.status)).length >= 2;
  const history = historyAvailable && search.view === "history";
  return (
    <div className="space-y-3">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex flex-col justify-between gap-2 px-4 pt-4 pb-3 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">{tracker.title}</h2>
            <p className="text-xs text-muted-foreground">{tracker.address}</p>
            <p className="text-xs text-muted-foreground">
              {tracker.gridSize}×{tracker.gridSize} grid · {tracker.spacingKm}{" "}
              km spacing · Mobile · Manual checks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(active)}
              onClick={() => setManagingKeywords(true)}
            >
              <Pencil data-icon="inline-start" />
              Manage keywords
            </Button>
            <Button
              size="sm"
              disabled={!keywords.length || Boolean(active)}
              pending={start.isPending}
              onClick={() => setConfirm(crypto.randomUUID())}
            >
              <Play data-icon="inline-start" />
              {active ? "Checking rankings…" : "Check rankings"}
            </Button>
          </div>
        </div>
        {failed && (
          <div className="px-4 pb-3">
            <QueryError
              fallback={
                failed.error ??
                "The last check returned no rankings. Earlier results are shown below."
              }
            />
          </div>
        )}
        {keyword && (
          <LocalKeywordMap
            projectId={projectId}
            tracker={tracker}
            keyword={keyword}
            selectedScan={selectedScan}
            historical={selectedScan?.id !== latestScan?.id}
            search={search}
            onSearchChange={onSearchChange}
          />
        )}
        <div className="flex flex-wrap items-center gap-2 border-y border-border px-4 py-2">
          {historyAvailable && (
            <SegmentedToggle
              showLabels
              items={[
                {
                  value: "latest",
                  icon: <List className="size-3.5" />,
                  label: "Latest",
                },
                {
                  value: "history",
                  icon: <CalendarDays className="size-3.5" />,
                  label: "History",
                },
              ]}
              value={history ? "history" : "latest"}
              onChange={(value) =>
                onSearchChange({
                  keyword: keyword?.id,
                  view: value === "history" ? "history" : undefined,
                })
              }
            />
          )}
          <span className="text-sm text-muted-foreground">
            {active
              ? `Checking ${estimate.keywords} keyword${estimate.keywords === 1 ? "" : "s"} across ${estimate.points} points`
              : `${keywords.length} keyword${keywords.length === 1 ? "" : "s"}`}
          </span>
          {history && (
            <span className="ml-auto text-xs text-muted-foreground">
              Average rank where found
            </span>
          )}
        </div>
        <div className="p-4">
          <LocalKeywordsTable
            data={data}
            history={history}
            selectedKeywordId={keyword?.id}
            selectedScanId={selectedScan?.id}
            onSelect={(keywordId, scanId) =>
              onSearchChange({
                view: search.view,
                keyword: keywordId,
                scan: scanId,
              })
            }
            onManage={() => setManagingKeywords(true)}
          />
        </div>
      </Card>
      {managingKeywords && (
        <LocalKeywordsDialog
          projectId={projectId}
          trackerId={tracker.id}
          keywords={keywords}
          onClose={() => setManagingKeywords(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Check ${estimate.keywords} keyword${estimate.keywords === 1 ? "" : "s"}?`}
          confirmLabel="Run now"
          pending={start.isPending}
          onConfirm={() => start.mutate(confirm)}
          onClose={() => setConfirm(null)}
        >
          {estimate.keywords} keyword{estimate.keywords === 1 ? "" : "s"}{" "}
          &times; {estimate.points} grid points = {estimate.searches} Google
          Maps searches on mobile. Costs up to{" "}
          <span className="font-mono font-semibold text-foreground">
            {/* Credits are $0.001, so three decimals show the exact maximum. */}
            {estimate.costUsd.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 2,
              maximumFractionDigits: 3,
            })}
          </span>
          .
        </ConfirmDialog>
      )}
    </div>
  );
}
