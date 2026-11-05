import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { NotificationRepository } from "@/server/features/notifications/repositories/NotificationRepository";
import {
  computeRankPositionChanges,
  filterRankChangesByDirection,
  type RankSnapshotPoint,
} from "@/server/features/notifications/rankPositionChanges";
import { buildRankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { openWebhookUrl } from "@/server/features/notifications/webhookSecrets";
import { postRankNotificationWebhook } from "@/server/features/notifications/webhookDelivery";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { rankTrackerLocationDisplay } from "@/shared/rank-tracker-location-display";

function snapshotPoints(
  rows: Awaited<ReturnType<typeof RankTrackingRepository.getSnapshotsForRun>>,
): RankSnapshotPoint[] {
  return rows.map((row) => ({
    trackingKeywordId: row.trackingKeywordId,
    keyword: row.keyword,
    device: row.device,
    position: row.position,
  }));
}

function ruleAppliesToConfig(
  rule: { rankConfigId: string | null },
  configId: string,
) {
  return rule.rankConfigId == null || rule.rankConfigId === configId;
}

async function buildTrackerUrl(projectId: string, configId: string) {
  const baseUrl = (await getOptionalEnvValue("BETTER_AUTH_URL"))?.replace(
    /\/$/,
    "",
  );
  if (!baseUrl) return null;
  return `${baseUrl}/p/${projectId}/rank-tracking/${configId}`;
}

/** Best-effort rank notifications after a completed check. Never throws. */
export async function notifyRankCheckComplete(input: {
  runId: string;
  configId: string;
  projectId: string;
  trigger: "manual" | "scheduled";
}) {
  try {
    const config = await RankTrackingRepository.getConfigById({
      configId: input.configId,
      projectId: input.projectId,
    });
    if (!config) return;

    const run = await RankTrackingRepository.getRunById(input.runId);
    if (!run || run.status !== "completed") return;

    const previousRun = await NotificationRepository.getPreviousCompletedRun({
      configId: input.configId,
      beforeStartedAt: run.startedAt,
      excludeRunId: input.runId,
    });
    if (!previousRun) return;

    const [currentSnaps, previousSnaps] = await Promise.all([
      RankTrackingRepository.getSnapshotsForRun(input.runId),
      RankTrackingRepository.getSnapshotsForRun(previousRun.id),
    ]);

    const current = snapshotPoints(currentSnaps);
    const previous = snapshotPoints(previousSnaps);

    const rules = await NotificationRepository.listEnabledProjectWideRankRules(
      input.projectId,
    );

    const trackerUrl = await buildTrackerUrl(input.projectId, input.configId);

    for (const { rule, channel } of rules) {
      if (!ruleAppliesToConfig(rule, input.configId)) continue;

      const allChanges = computeRankPositionChanges({
        current,
        previous,
        serpDepth: config.serpDepth,
        positionThreshold: rule.positionThreshold,
      });

      const direction = rule.positionChangeDirection ?? "either";
      const changes = filterRankChangesByDirection({
        changes: allChanges,
        serpDepth: config.serpDepth,
        direction,
      });

      const shouldSendAlert = changes.length > 0;
      const shouldSendWeekly =
        rule.weeklySummary &&
        input.trigger === "scheduled" &&
        config.scheduleInterval === "weekly";
      if (!shouldSendAlert && !shouldSendWeekly) continue;

      const recorded = await NotificationRepository.tryRecordDelivery({
        ruleId: rule.id,
        runId: input.runId,
      });
      if (!recorded) continue;

      const market = rankTrackerLocationDisplay({
        locationCode: config.locationCode,
        locationName: config.locationName,
      });

      const content = buildRankNotificationContent({
        domain: config.domain,
        marketLabel: market.label,
        trigger: input.trigger,
        positionThreshold: rule.positionThreshold,
        positionChangeDirection: direction,
        serpDepth: config.serpDepth,
        changes,
        weeklySummaryOnly: shouldSendWeekly && !shouldSendAlert,
        weeklySummaryNote: shouldSendWeekly && shouldSendAlert,
        trackerUrl,
      });

      const webhookUrl = await openWebhookUrl(channel.webhookCiphertext);
      await postRankNotificationWebhook({
        provider: channel.provider,
        webhookUrl,
        content,
      });
    }
  } catch (error) {
    console.error("rank notification delivery failed", {
      runId: input.runId,
      configId: input.configId,
      error,
    });
  }
}
