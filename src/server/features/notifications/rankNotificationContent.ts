import type { RankPositionChangeDirection } from "@/types/schemas/notifications";
import { filterRankChangesByDirection } from "@/server/features/notifications/rankPositionChanges";
import type { RankPositionChange } from "@/server/features/notifications/rankPositionChanges";
import {
  formatRankPosition,
  formatRankTrendLabel,
} from "@/server/features/notifications/rankPositionChanges";
import { rankDirectionLabel } from "@/shared/rank-notification-direction";

export const RANK_NOTIFICATION_CHANGE_CAP = 12;

export type RankNotificationContent = {
  domain: string;
  /** Country / market for the rank tracker (when known). */
  marketLabel: string | null;
  trigger: "manual" | "scheduled";
  positionThreshold: number;
  positionChangeDirection: RankPositionChangeDirection;
  /** Used to label improved vs worsened when positions include "not in results". */
  serpDepth: number;
  changes: RankPositionChange[];
  omittedChangeCount: number;
  weeklySummaryOnly: boolean;
  weeklySummaryNote: boolean;
  trackerUrl: string | null;
  /** Sample / preview sends only — labelled in Teams card and Slack text. */
  isSample?: boolean;
};

export function buildRankNotificationContent(input: {
  domain: string;
  marketLabel?: string | null;
  trigger: "manual" | "scheduled";
  positionThreshold: number;
  positionChangeDirection?: RankPositionChangeDirection;
  serpDepth: number;
  changes: RankPositionChange[];
  weeklySummaryOnly: boolean;
  weeklySummaryNote: boolean;
  trackerUrl: string | null;
  isSample?: boolean;
}): RankNotificationContent {
  const capped = input.changes.slice(0, RANK_NOTIFICATION_CHANGE_CAP);
  return {
    domain: input.domain,
    marketLabel: input.marketLabel ?? null,
    trigger: input.trigger,
    positionThreshold: input.positionThreshold,
    positionChangeDirection: input.positionChangeDirection ?? "either",
    serpDepth: input.serpDepth,
    changes: capped,
    omittedChangeCount: Math.max(
      0,
      input.changes.length - RANK_NOTIFICATION_CHANGE_CAP,
    ),
    weeklySummaryOnly: input.weeklySummaryOnly,
    weeklySummaryNote: input.weeklySummaryNote,
    trackerUrl: input.trackerUrl,
    isSample: input.isSample,
  };
}

export function rankNotificationMetadataFacts(
  content: RankNotificationContent,
): Array<{ title: string; value: string }> {
  const facts: Array<{ title: string; value: string }> = [
    { title: "Domain", value: content.domain },
  ];
  if (content.marketLabel) {
    facts.push({ title: "Market", value: content.marketLabel });
  }
  facts.push(
    { title: "Trigger", value: content.trigger },
    {
      title: "Threshold",
      value: `${content.positionThreshold}+ positions`,
    },
  );
  if (content.positionChangeDirection !== "either") {
    facts.push({
      title: "Direction",
      value: rankDirectionLabel(content.positionChangeDirection),
    });
  }
  return facts;
}

/** Plain text for Slack incoming webhooks (mrkdwn-friendly). */
export function formatRankNotificationPlainText(
  content: RankNotificationContent,
): string {
  const lines: string[] = [];
  if (content.isSample) {
    lines.push("_Sample rank alert (preview — not from a live check)._");
  }
  lines.push(`*OpenSEO rank update* — ${content.domain}`);
  if (content.marketLabel) {
    lines.push(`Market: ${content.marketLabel}`);
  }
  lines.push(`Trigger: ${content.trigger}`);
  if (content.positionChangeDirection !== "either") {
    lines.push(
      `Direction: ${rankDirectionLabel(content.positionChangeDirection)}`,
    );
  }

  if (content.changes.length > 0) {
    lines.push(
      `Keywords changed by ${content.positionThreshold}+ positions (${content.changes.length} that match this rule's conditions):`,
      ...content.changes.map((change) => {
        const trend = formatRankTrendLabel(change, content.serpDepth);
        const verb = trend.direction === "improved" ? "Improved" : "Dropped";
        return `${change.keyword} (${change.device}): ${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)} · ${trend.arrow} ${verb} ${change.delta}`;
      }),
    );
    if (content.omittedChangeCount > 0) {
      lines.push(`…and ${content.omittedChangeCount} more`);
    }
  }

  if (content.weeklySummaryOnly) {
    lines.push("Weekly check completed — no keywords crossed your threshold.");
  } else if (content.weeklySummaryNote) {
    lines.push("(Weekly summary enabled for this rule.)");
  }

  if (content.trackerUrl) {
    lines.push(`View tracker: ${content.trackerUrl}`);
  }

  return lines.join("\n");
}

export function sampleRankNotificationContent(input?: {
  domain?: string;
  trackerUrl?: string | null;
  positionThreshold?: number;
  positionChangeDirection?: RankPositionChangeDirection;
  weeklySummary?: boolean;
  marketLabel?: string | null;
}): RankNotificationContent {
  const serpDepth = 100;
  const positionThreshold = input?.positionThreshold ?? 3;
  const direction = input?.positionChangeDirection ?? "either";

  const allChanges: RankPositionChange[] = [
    {
      trackingKeywordId: "sample-1",
      keyword: "ravensburger",
      device: "mobile",
      previousPosition: 79,
      position: 16,
      delta: 63,
    },
    {
      trackingKeywordId: "sample-2",
      keyword: "best jigsaw puzzle",
      device: "desktop",
      previousPosition: 59,
      position: 7,
      delta: 52,
    },
    {
      trackingKeywordId: "sample-3",
      keyword: "jigsaw puzzle",
      device: "mobile",
      previousPosition: 53,
      position: 4,
      delta: 49,
    },
    {
      trackingKeywordId: "sample-4",
      keyword: "jigsaws for sale",
      device: "mobile",
      previousPosition: 2,
      position: 43,
      delta: 41,
    },
    {
      trackingKeywordId: "sample-5",
      keyword: "puzzles for adults",
      device: "desktop",
      previousPosition: 40,
      position: 1,
      delta: 39,
    },
  ];

  const changes = filterRankChangesByDirection({
    changes: allChanges.filter((change) => change.delta >= positionThreshold),
    serpDepth,
    direction,
  });

  return buildRankNotificationContent({
    domain: input?.domain ?? "alljigsawpuzzles.co.uk",
    marketLabel: input?.marketLabel ?? "United Kingdom",
    trigger: "manual",
    positionThreshold,
    positionChangeDirection: direction,
    serpDepth,
    changes,
    weeklySummaryOnly: false,
    weeklySummaryNote: input?.weeklySummary ?? true,
    trackerUrl: input?.trackerUrl ?? null,
    isSample: true,
  });
}
