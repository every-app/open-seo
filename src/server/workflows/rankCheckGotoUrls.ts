import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  MAX_GOTO_URLS_PER_REQUEST,
  resolveGotoUrls,
} from "@/server/lib/dataforseo";
import { isGoogleRedirect } from "@/shared/google-serp-url";

/** Google adds srsltid to many result links; it isn't part of the page. */
function withoutGoogleTracking(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("srsltid")) return url;
  parsed.searchParams.delete("srsltid");
  return parsed.toString();
}

/**
 * Replace the run's google.com/goto ranking URLs with the real pages. Each
 * chunk is saved as it resolves, so a retry only repeats what's left. A URL
 * that can't be resolved keeps its goto link, which still redirects to the page.
 */
export async function resolveRunGotoUrls(runId: string): Promise<void> {
  const snapshots = await RankTrackingRepository.getSnapshotsForRun(runId);
  const wrapped = snapshots.flatMap(({ id, url }) =>
    url && isGoogleRedirect(url) ? [{ id, url }] : [],
  );

  for (let i = 0; i < wrapped.length; i += MAX_GOTO_URLS_PER_REQUEST) {
    const chunk = wrapped.slice(i, i + MAX_GOTO_URLS_PER_REQUEST);
    const resolved = await resolveGotoUrls(chunk.map(({ url }) => url));
    await RankTrackingRepository.updateSnapshotUrls(
      chunk.flatMap(({ id, url }) => {
        const page = resolved.get(url);
        return page ? [{ id, url: withoutGoogleTracking(page) }] : [];
      }),
    );
  }
}
