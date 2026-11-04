const ALLOWED_HOST_SUFFIXES = [
  "hooks.slack.com",
  "slack.com",
  "webhook.office.com",
  "outlook.office.com",
  "office.com",
  "office365.com",
  "logic.azure.com",
  "powerplatform.com",
  "powerautomate.com",
  "azure.com",
] as const;

function hostMatchesAllowlist(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

import { AppError } from "@/server/lib/errors";

/** Validates Slack / Teams incoming webhook URLs before we store or fetch them. */
export function validateNotificationWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("INTERNAL_ERROR", "Enter a valid webhook URL.");
  }

  if (url.protocol !== "https:") {
    throw new AppError("INTERNAL_ERROR", "Webhook URLs must use HTTPS.");
  }

  if (url.username || url.password) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Webhook URLs must not include credentials.",
    );
  }

  if (!hostMatchesAllowlist(url.hostname)) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Use a Slack incoming webhook or a Microsoft Teams / Power Automate webhook URL.",
    );
  }

  return url;
}
