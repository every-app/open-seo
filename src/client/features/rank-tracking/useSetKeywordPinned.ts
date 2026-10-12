import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type getLatestRankResults,
  setTrackingKeywordsPinned,
} from "@/serverFunctions/rank-tracking";

type RankResults = Awaited<ReturnType<typeof getLatestRankResults>>;

/** Pins or unpins one keyword, and shows the change before the save ends. */
export function useSetKeywordPinned(projectId: string, configId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["rankTrackingResults", projectId, configId];

  const { mutate } = useMutation({
    mutationFn: (vars: { trackingKeywordId: string; pinned: boolean }) =>
      setTrackingKeywordsPinned({
        data: {
          projectId,
          configId,
          keywordIds: [vars.trackingKeywordId],
          pinned: vars.pinned,
        },
      }),
    // Update every compare period's cached results, so the row moves at once.
    onMutate: async ({ trackingKeywordId, pinned }) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueriesData<RankResults>({ queryKey }, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((row) =>
                row.trackingKeywordId === trackingKeywordId
                  ? { ...row, pinned }
                  : row,
              ),
            }
          : old,
      );
    },
    // On failure, the refetch puts the table back on the stored pins. This is
    // onSettled, not onError: an onError here would hide the global toast.
    onSettled: (_data, error) => {
      if (error) void queryClient.invalidateQueries({ queryKey });
    },
  });

  return mutate;
}
