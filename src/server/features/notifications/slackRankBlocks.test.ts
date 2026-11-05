import { describe, expect, it } from "vitest";
import { sampleRankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { buildSlackRankNotificationPayload } from "@/server/features/notifications/slackRankBlocks";

describe("slackRankBlocks", () => {
  it("builds Block Kit payload with header and sections", () => {
    const payload = buildSlackRankNotificationPayload(
      sampleRankNotificationContent({ domain: "example.com" }),
    );

    expect(payload.text).toContain("OpenSEO rank update");
    expect(payload.blocks.some((b) => b.type === "header")).toBe(true);
    expect(payload.blocks.some((b) => b.type === "section")).toBe(true);
    expect(JSON.stringify(payload.blocks)).toContain("▲");
    expect(JSON.stringify(payload.blocks)).toContain("▼");
  });
});
