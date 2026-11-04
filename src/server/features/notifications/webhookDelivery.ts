import type { NotificationProvider } from "@/types/schemas/notifications";

function buildPayload(provider: NotificationProvider, text: string) {
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
  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(input.provider, input.text)),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `Webhook returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
  );
}
