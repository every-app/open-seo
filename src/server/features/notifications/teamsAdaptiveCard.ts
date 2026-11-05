import type { RankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import {
  RANK_NOTIFICATION_CHANGE_CAP,
  rankNotificationMetadataFacts,
} from "@/server/features/notifications/rankNotificationContent";
import {
  formatRankPosition,
  formatRankTrendLabel,
} from "@/server/features/notifications/rankPositionChanges";

type AdaptiveElement = Record<string, unknown>;

/** Teams incoming webhooks accept Adaptive Card attachments (not MessageCard `text` alone). */
export function buildTeamsAdaptiveCardAttachment(
  content: RankNotificationContent,
): { contentType: string; content: AdaptiveElement } {
  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: content.isSample
        ? "OpenSEO rank update (sample preview)"
        : "OpenSEO rank update",
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    },
  ];

  if (content.isSample) {
    body.push({
      type: "TextBlock",
      text: "Sample data for layout testing — not from a live rank check.",
      isSubtle: true,
      wrap: true,
      spacing: "Small",
    });
  }

  body.push({
    type: "FactSet",
    spacing: "Medium",
    facts: rankNotificationMetadataFacts(content).map((fact) => ({
      title: fact.title,
      value: fact.value,
    })),
  });

  if (content.changes.length > 0) {
    body.push({
      type: "TextBlock",
      text: "Keyword changes",
      weight: "Bolder",
      spacing: "Medium",
    });

    for (const change of content.changes) {
      const trend = formatRankTrendLabel(change, content.serpDepth);
      const trendColor = trend.direction === "improved" ? "Good" : "Attention";

      body.push({
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: change.keyword,
                wrap: true,
                weight: "Bolder",
              },
              {
                type: "TextBlock",
                text: change.device,
                isSubtle: true,
                spacing: "None",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: `${formatRankPosition(change.previousPosition)} → ${formatRankPosition(change.position)}`,
                horizontalAlignment: "Right",
                wrap: true,
              },
              {
                type: "TextBlock",
                text: trend.text,
                horizontalAlignment: "Right",
                color: trendColor,
                weight: "Bolder",
                spacing: "None",
              },
            ],
          },
        ],
        separator: true,
      });
    }

    if (content.omittedChangeCount > 0) {
      body.push({
        type: "TextBlock",
        text: `…and ${content.omittedChangeCount} more (showing first ${RANK_NOTIFICATION_CHANGE_CAP})`,
        isSubtle: true,
        wrap: true,
        spacing: "Small",
      });
    }
  }

  if (content.weeklySummaryOnly) {
    body.push({
      type: "TextBlock",
      text: "Weekly check completed — no keywords crossed your threshold.",
      wrap: true,
      spacing: "Medium",
    });
  } else if (content.weeklySummaryNote) {
    body.push({
      type: "TextBlock",
      text: "Weekly summary enabled for this rule.",
      isSubtle: true,
      wrap: true,
      spacing: "Medium",
    });
  }

  const actions: AdaptiveElement[] = [];
  if (content.trackerUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View tracker",
      url: content.trackerUrl,
    });
  }

  const card: AdaptiveElement = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };

  return {
    contentType: "application/vnd.microsoft.card.adaptive",
    content: card,
  };
}

export function buildTeamsWebhookBody(content: RankNotificationContent): {
  type: string;
  attachments: ReturnType<typeof buildTeamsAdaptiveCardAttachment>[];
} {
  return {
    type: "message",
    attachments: [buildTeamsAdaptiveCardAttachment(content)],
  };
}
