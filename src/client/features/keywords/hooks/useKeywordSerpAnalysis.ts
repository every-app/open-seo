import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpAnalysis } from "@/serverFunctions/keywords";

const SERP_PAGE_SIZE = 10;
/** Depth every SERP panel opens at — two pages of results, ~5 credits. */
const SERP_INITIAL_DEPTH = 20;
/**
 * Depth we buy when a user pages past what's loaded. Google has no offset, so
 * this re-crawls the top of the SERP: the deeper snapshot replaces the shallow
 * one instead of extending it, and costs ~20 more credits.
 */
const SERP_DEEP_DEPTH = 100;

export function useKeywordSerpAnalysis(
  projectId: string,
  locationCode: number | undefined,
) {
  const [serpKeyword, setSerpKeywordState] = useState<string | null>(null);
  const [serpPage, setSerpPageState] = useState(0);
  const [requestedDepth, setRequestedDepth] = useState<20 | 100>(
    SERP_INITIAL_DEPTH,
  );

  // Everything but the depth identifies the snapshot; the depth decides how
  // deep it goes.
  const snapshotKey = ["serpAnalysis", projectId, serpKeyword, locationCode];

  const serpQuery = useQuery({
    queryKey: [...snapshotKey, requestedDepth],
    queryFn: () =>
      getSerpAnalysis({
        data: {
          projectId,
          keyword: serpKeyword!,
          locationCode,
          depth: requestedDepth,
        },
      }),
    // Keep the shallow snapshot on screen while the deeper refetch runs — but
    // only when nothing except the depth changed, so a new keyword or market
    // shows the loading state instead of the previous SERP.
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      const sameSnapshot = snapshotKey.every(
        (part, index) => previousKey?.[index] === part,
      );
      return sameSnapshot ? previous : undefined;
    },
    // Every fetch here is billed, and a deep crawl can outrun DataForSEO's
    // request deadline — a timed-out call may already be billed upstream while
    // metering nothing. Never replay or re-issue one without the user asking;
    // the card offers an explicit retry.
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    enabled: !!serpKeyword,
  });

  const { refetch: refetchSerp } = serpQuery;
  const serpResults = serpQuery.data?.items ?? [];
  const activeSerpKeyword =
    serpKeyword ?? serpQuery.data?.requestedKeyword ?? null;
  const serpLoading = !!serpKeyword && serpQuery.isLoading;
  const serpError = serpQuery.isError
    ? getStandardErrorMessage(serpQuery.error, "Failed to load SERP data.")
    : null;

  // A deeper fetch is available until the loaded snapshot is the deep one.
  const canLoadMoreSerp =
    (serpQuery.data?.depth ?? SERP_DEEP_DEPTH) < SERP_DEEP_DEPTH;
  const serpLoadingMore = serpQuery.isPlaceholderData;

  // A failed deep fetch leaves nothing on screen, and retrying it re-buys the
  // expensive call. The card offers the shallow snapshot back instead.
  const deepFetchFailed =
    serpQuery.isError && requestedDepth === SERP_DEEP_DEPTH;

  // Retrying a failed deep crawl re-buys the expensive call that just timed
  // out. Drop back to the shallow snapshot instead: it's still cached, so the
  // user gets their results back for free and can ask for 100 again.
  const retrySerp = useCallback(() => {
    if (requestedDepth === SERP_DEEP_DEPTH) {
      setRequestedDepth(SERP_INITIAL_DEPTH);
      return;
    }
    void refetchSerp();
  }, [refetchSerp, requestedDepth]);

  const setSerpKeyword = useCallback((keyword: string | null) => {
    setSerpKeywordState(keyword);
    setRequestedDepth(SERP_INITIAL_DEPTH);
  }, []);

  const loadedPages = Math.max(
    1,
    Math.ceil(serpResults.length / SERP_PAGE_SIZE),
  );
  // While the deeper snapshot loads the user stays on the page they asked for;
  // once it lands, a SERP too small to fill that page falls back to the last.
  const visiblePage = serpLoadingMore
    ? serpPage
    : Math.min(serpPage, loadedPages - 1);

  const setSerpPage = useCallback(
    (nextPage: number) => {
      // Paging forward past the loaded results buys the full 100-deep snapshot;
      // the user lands on the requested page once it arrives.
      if (
        nextPage > visiblePage &&
        nextPage >= loadedPages &&
        canLoadMoreSerp
      ) {
        setRequestedDepth(SERP_DEEP_DEPTH);
      }
      setSerpPageState(nextPage);
    },
    [canLoadMoreSerp, loadedPages, visiblePage],
  );

  return {
    serpKeyword,
    setSerpKeyword,
    retrySerp,
    serpPage: visiblePage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpQuery,
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpLoadingMore,
    canLoadMoreSerp,
    deepFetchFailed,
    serpError,
  };
}
