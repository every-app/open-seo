import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type { createDataforseoClient } from "@/server/lib/dataforseoClient";
import type { RankCheckResult } from "@/server/lib/dataforseo";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { KEYWORDS_PER_BATCH } from "@/shared/rank-tracking";

const SINGLE_ATTEMPT_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "2 minutes" as const,
};

type KeywordEntry = { id: string; keyword: string };
type RankCheckResultWithDevice = RankCheckResult & {
  device: "desktop" | "mobile";
};

function mapResultsToSnapshotRows(
  runId: string,
  results: RankCheckResultWithDevice[],
) {
  return results.map((r) => ({
    runId,
    trackingKeywordId: r.keywordId,
    keyword: r.keyword,
    device: r.device,
    position: r.position,
    url: r.url,
    serpFeatures:
      r.serpFeatures.length > 0 ? JSON.stringify(r.serpFeatures) : null,
  }));
}

interface CheckContext {
  client: ReturnType<typeof createDataforseoClient>;
  keywords: KeywordEntry[];
  devices: RankTrackingConfig["devices"];
  serpDepth: number;
  domain: string;
  locationCode: number;
  languageCode: string;
  runId: string;
}

/**
 * Check keywords via Live API, parallel devices per keyword, real-time progress.
 * Snapshots are written incrementally after each batch so partial results
 * survive batch failures. ~6s per keyword batch.
 * Billing is handled per-call by the metered client.
 */
export async function runLiveCheck(
  step: WorkflowStep,
  ctx: CheckContext,
): Promise<{ totalFailed: number }> {
  const deviceList: Array<"desktop" | "mobile"> =
    ctx.devices === "both" ? ["desktop", "mobile"] : [ctx.devices];
  let checked = 0;
  let totalFailed = 0;

  for (let i = 0; i < ctx.keywords.length; i += KEYWORDS_PER_BATCH) {
    const batch = ctx.keywords.slice(i, i + KEYWORDS_PER_BATCH);
    const batchIndex = Math.floor(i / KEYWORDS_PER_BATCH);

    const batchResults = await step.do(
      `live-batch-${batchIndex}`,
      SINGLE_ATTEMPT_STEP_CONFIG,
      async () => {
        const promises = batch.flatMap((kw) =>
          deviceList.map((device) =>
            ctx.client.serp
              .rankCheck({
                keyword: kw.keyword,
                keywordId: kw.id,
                locationCode: ctx.locationCode,
                languageCode: ctx.languageCode,
                device,
                targetDomain: ctx.domain,
                depth: ctx.serpDepth,
              })
              .then((r) => ({ ...r, device })),
          ),
        );
        const settled = await Promise.allSettled(promises);
        const results: RankCheckResultWithDevice[] = [];
        let batchFailed = 0;
        for (const outcome of settled) {
          if (outcome.status === "fulfilled") {
            results.push(outcome.value);
          } else {
            batchFailed++;
            console.error("Rank check call failed:", outcome.reason);
          }
        }
        checked += batch.length;
        await RankTrackingRepository.updateRun(ctx.runId, {
          keywordsChecked: checked,
        });

        if (results.length > 0) {
          await RankTrackingRepository.insertSnapshots(
            mapResultsToSnapshotRows(ctx.runId, results),
          );
        }
        return { batchFailed };
      },
    );

    totalFailed += batchResults.batchFailed;
  }

  if (totalFailed > 0) {
    console.warn(`Rank check completed with ${totalFailed} failed API call(s)`);
  }

  return { totalFailed };
}
