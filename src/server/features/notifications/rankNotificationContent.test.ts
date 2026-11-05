import { describe, expect, it } from "vitest";
import {
  formatRankNotificationPlainText,
  sampleRankNotificationContent,
} from "@/server/features/notifications/rankNotificationContent";

describe("rankNotificationContent", () => {
  it("formats Slack plain text with line breaks", () => {
    const text = formatRankNotificationPlainText(
      sampleRankNotificationContent({ domain: "example.com" }),
    );

    expect(text).toContain("Sample rank alert");
    expect(text.split("\n").length).toBeGreaterThan(3);
    expect(text).toContain("ravensburger");
  });
});
