import type { RankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { formatRankNotificationPlainText } from "@/server/features/notifications/rankNotificationContent";
import {
  formatRankPosition,
  formatRankTrendLabel,
} from "@/server/features/notifications/rankPositionChanges";

type SlackBlock = Record<string, unknown>;

/**
 * Slack incoming webhooks support Block Kit (`blocks`) plus a plain `text` fallback.
 * @see https://api.slack.com/messaging/webhooks
 * @see https://api.slack.com/reference/block-kit/blocks
 */
export function buildSlackRankNotificationPayload(
  content: RankNotificationContent,
): { text: string; blocks: SlackBlock[] } {
  const blocks: SlackBlock[] = [];

  if (content.isSample) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Sample rank alert (preview — not from a live check)._",
        },
      ],
    });
  }

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "OpenSEO rank update",
      emoji: true,
    },
  });

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Domain*\n${content.domain}` },
      { type: "mrkdwn", text: `*Trigger*\n${content.trigger}` },
      {
        type: "mrkdwn",
        text: `*Threshold*\n${content.positionThreshold}+ positions`,
      },
    ],
  });

  if (content.changes.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Keyword movement* (${content.changes.length} shown)`,
      },
    });

    for (const change of content.changes) {
      const trend = formatRankTrendLabel(change, content.serpDepth);
      const trendWord = trend.direction === "improved" ? "Improved" : "Dropped";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${change.keyword}* · ${change.device}`,
            `${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)}`,
            `${trend.arrow} *${trendWord}* by ${change.delta} positions`,
          ].join("\n"),
        },
      });
    }

    if (content.omittedChangeCount > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_…and ${content.omittedChangeCount} more_`,
          },
        ],
      });
    }
  }

  if (content.weeklySummaryOnly) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Weekly check completed — no keywords crossed your threshold.",
      },
    });
  } else if (content.weeklySummaryNote) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Weekly summary enabled for this rule._",
        },
      ],
    });
  }

  if (content.trackerUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View tracker", emoji: true },
          url: content.trackerUrl,
          action_id: "view_tracker",
        },
      ],
    });
  }

  return {
    text: formatRankNotificationPlainText(content),
    blocks,
  };
}
