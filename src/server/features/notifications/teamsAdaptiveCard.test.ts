import { describe, expect, it } from "vitest";
import { sampleRankNotificationContent } from "@/server/features/notifications/rankNotificationContent";
import { buildTeamsWebhookBody } from "@/server/features/notifications/teamsAdaptiveCard";

describe("teamsAdaptiveCard", () => {
  it("builds an adaptive card attachment for rank alerts", () => {
    const content = sampleRankNotificationContent({
      domain: "alljigsawpuzzles.co.uk",
    });
    const body = buildTeamsWebhookBody(content);

    expect(body.type).toBe("message");
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]?.contentType).toBe(
      "application/vnd.microsoft.card.adaptive",
    );

    const card = body.attachments[0]?.content as {
      type: string;
      body: Array<{ type: string; text?: string }>;
      actions?: Array<{ type: string; title: string }>;
    };

    expect(card.type).toBe("AdaptiveCard");
    expect(card.body.some((b) => b.text?.includes("sample preview"))).toBe(
      true,
    );
    expect(card.body.some((b) => b.type === "FactSet")).toBe(true);
    expect(
      card.body.filter((b) => b.type === "ColumnSet").length,
    ).toBeGreaterThan(0);

    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain('"color":"Good"');
    expect(cardJson).toContain('"color":"Attention"');
  });
});
