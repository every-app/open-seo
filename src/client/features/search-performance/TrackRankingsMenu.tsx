import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LineChart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  addTrackingKeywords,
  getRankTrackingConfigs,
} from "@/serverFunctions/rank-tracking";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";

/** Bulk action: add the selected queries to one of the project's rank trackers. */
export function TrackRankingsMenu({
  projectId,
  queries,
  onAdded,
}: {
  projectId: string;
  queries: string[];
  onAdded: () => void;
}) {
  const queryClient = useQueryClient();
  const configsQuery = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
  });
  const configs = configsQuery.data ?? [];

  const add = useMutation({
    mutationFn: (configId: string) =>
      addTrackingKeywords({
        data: {
          projectId,
          configId,
          // One overlong query would fail the whole request.
          keywords: queries.filter(
            (query) => query.length <= MAX_TRACKED_KEYWORD_LENGTH,
          ),
        },
      }),
    onSuccess: (result, configId) => {
      captureClientEvent("rank_tracking:keywords_add", {
        source_feature: "search_performance",
        keyword_count: result.added,
      });
      for (const key of [
        "rankTrackingResults",
        "rankTrackingCostEstimate",
        "rankTrackingLatestRun",
      ]) {
        void queryClient.invalidateQueries({
          queryKey: [key, projectId, configId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigSummaries", projectId],
      });
      const skipped = queries.length - result.added;
      toast.success(
        `Tracking ${result.added} new keyword${result.added === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} already tracked, too long, or over the limit)` : ""}`,
      );
      if (result.checkScheduledSoon) {
        toast.info("The scheduled check within the hour covers these keywords");
      }
      onAdded();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" pending={add.isPending} />}
      >
        {add.isPending ? null : <LineChart data-icon="inline-start" />}
        Track rankings
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-72">
        {configs.length === 0 ? (
          <DropdownMenuItem
            disabled={configsQuery.isLoading}
            render={
              <Link to="/p/$projectId/rank-tracking" params={{ projectId }} />
            }
          >
            {configsQuery.isLoading
              ? "Loading rank trackers…"
              : "Set up rank tracking first"}
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuLabel>Add to rank tracker</DropdownMenuLabel>
            {configs.map((config) => (
              <DropdownMenuItem
                key={config.id}
                disabled={add.isPending}
                onClick={() => add.mutate(config.id)}
              >
                <span className="truncate">
                  {config.domain} ·{" "}
                  {config.locationName ??
                    LOCATIONS[config.locationCode] ??
                    config.locationCode}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
