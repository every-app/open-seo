import type { RankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import {
  formatRankNotificationPlainText,
  rankNotificationMetadataFacts,
} from "@/server/features/notifications/rankNotificationContent";
import {
  formatRankPosition,
  formatRankTrendLabel,
} from "@/server/features/notifications/rankPositionChanges";

type SlackBlock = Record<string, unknown>;

/** Slack Block Kit has no text colours; emoji distinguish direction. */
function slackTrendLine(
  change: RankNotificationContent["changes"][number],
  serpDepth: number,
): string {
  const trend = formatRankTrendLabel(change, serpDepth);
  const marker =
    trend.direction === "improved" ? ":large_green_circle:" : ":red_circle:";
  const word = trend.direction === "improved" ? "Improved" : "Dropped";
  return `${marker} ${trend.arrow} *${word}* by ${change.delta}`;
}

function keywordChangesHeading(count: number): string {
  return `*Keyword changes* (${count} that match this rule's conditions)`;
}

/**
 * Slack incoming webhooks support Block Kit (`blocks`) plus a plain `text` fallback.
 * Attachments add a coloured left border (“card”) around the keyword table.
 * @see https://api.slack.com/messaging/webhooks
 * @see https://api.slack.com/reference/block-kit/blocks
 */
export function buildSlackRankNotificationPayload(
  content: RankNotificationContent,
): {
  text: string;
  blocks: SlackBlock[];
  attachments: Array<{ color: string; blocks: SlackBlock[] }>;
} {
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
    type: "section",
    fields: rankNotificationMetadataFacts(content).map((fact) => ({
      type: "mrkdwn",
      text: `*${fact.title}*\n${fact.value}`,
    })),
  });

  const cardBlocks: SlackBlock[] = [];

  if (content.changes.length > 0) {
    cardBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: keywordChangesHeading(content.changes.length),
      },
    });

    cardBlocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Keyword*" },
        { type: "mrkdwn", text: "*Rank change*" },
      ],
    });

    for (const change of content.changes) {
      cardBlocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*${change.keyword}*\n_${change.device}_`,
          },
          {
            type: "mrkdwn",
            text: [
              `${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)}`,
              slackTrendLine(change, content.serpDepth),
            ].join("\n"),
          },
        ],
      });
    }

    if (content.omittedChangeCount > 0) {
      cardBlocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_…and ${content.omittedChangeCount} more that match this rule's conditions_`,
          },
        ],
      });
    }
  }

  if (content.weeklySummaryOnly) {
    cardBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Weekly check completed — no keywords crossed your threshold.",
      },
    });
  } else if (content.weeklySummaryNote) {
    cardBlocks.push({
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
    cardBlocks.push({
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

  const attachments: Array<{ color: string; blocks: SlackBlock[] }> = [];
  if (cardBlocks.length > 0) {
    blocks.push({ type: "divider" });
    attachments.push({
      color: "#1264A3",
      blocks: cardBlocks,
    });
  }

  return {
    text: formatRankNotificationPlainText(content),
    blocks,
    attachments,
  };
}
