import { describe, expect, it } from "vitest";
import { sampleRankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { buildSlackRankNotificationPayload } from "@/server/features/notifications/slackRankBlocks";

describe("slackRankBlocks", () => {
  it("builds metadata fields, attachment card, and trend emoji", () => {
    const payload = buildSlackRankNotificationPayload(
      sampleRankNotificationContent({ domain: "example.com" }),
    );

    expect(payload.blocks.some((b) => b.type === "header")).toBe(false);
    expect(
      payload.blocks.some(
        (b) => b.type === "section" && Array.isArray(b.fields),
      ),
    ).toBe(true);
    expect(payload.attachments).toHaveLength(1);
    expect(JSON.stringify(payload.attachments)).toContain(
      "that match this rule's conditions",
    );
    expect(JSON.stringify(payload.attachments)).toContain(
      ":large_green_circle:",
    );
    expect(JSON.stringify(payload.attachments)).toContain(":red_circle:");
    expect(JSON.stringify(payload.attachments)).toContain("▲");
    expect(JSON.stringify(payload.attachments)).toContain("▼");
  });
});
