import { describe, expect, it } from "vitest";
import { validateNotificationWebhookUrl } from "./validateWebhookUrl";

describe("validateNotificationWebhookUrl", () => {
  it("accepts Slack incoming webhooks", () => {
    const url = validateNotificationWebhookUrl(
      "https://hooks.slack.com/services/T/B/xxx",
    );
    expect(url.hostname).toBe("hooks.slack.com");
  });

  it("accepts Teams workflow webhooks", () => {
    const url = validateNotificationWebhookUrl(
      "https://outlook.office.com/webhook/abc/def",
    );
    expect(url.hostname).toBe("outlook.office.com");
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() =>
      validateNotificationWebhookUrl("http://hooks.slack.com/services/x"),
    ).toThrow(/HTTPS/i);
  });

  it("rejects unknown hosts", () => {
    expect(() =>
      validateNotificationWebhookUrl("https://evil.example/hook"),
    ).toThrow(/Slack incoming webhook/i);
  });
});
