import type { RankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { buildSlackRankNotificationPayload } from "@/server/features/notifications/slackRankBlocks";
import { buildTeamsWebhookBody } from "@/server/features/notifications/teamsAdaptiveCard";
import type { NotificationProvider } from "@/types/schemas/notifications";

function buildConnectionTestPayload(
  provider: NotificationProvider,
  text: string,
) {
  if (provider === "slack") {
    return { text };
  }

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: text.slice(0, 200),
    themeColor: "0078D4",
    text,
  };
}

export async function postNotificationWebhook(input: {
  provider: NotificationProvider;
  webhookUrl: string;
  text: string;
}) {
  const body = buildConnectionTestPayload(input.provider, input.text);
  await postWebhookJson(input.webhookUrl, body);
}

export async function postRankNotificationWebhook(input: {
  provider: NotificationProvider;
  webhookUrl: string;
  content: RankNotificationContent;
}) {
  if (input.provider === "slack") {
    await postWebhookJson(
      input.webhookUrl,
      buildSlackRankNotificationPayload(input.content),
    );
    return;
  }

  await postWebhookJson(input.webhookUrl, buildTeamsWebhookBody(input.content));
}

async function postWebhookJson(webhookUrl: string, body: unknown) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return;
  }

  const responseBody = await response.text().catch(() => "");
  throw new Error(
    `Webhook returned ${response.status}${responseBody ? `: ${responseBody.slice(0, 200)}` : ""}`,
  );
}
