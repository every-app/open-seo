import { describe, expect, it } from "vitest";
import {
  classifyCompetitorPageType,
  summarizeCompetitorAuditChanges,
} from "@/server/features/audit/competitorContent";

describe("classifyCompetitorPageType", () => {
  it("classifies page types from URL and title heuristics", () => {
    expect(
      classifyCompetitorPageType({
        url: "https://mudrex.com/blog/bitcoin-etf-guide",
        title: "Bitcoin ETF Guide | Mudrex",
      }),
    ).toBe("guide/blog");
    expect(
      classifyCompetitorPageType({
        url: "https://onramp.money/usdt-inr",
        title: "USDT to INR Onramp",
      }),
    ).toBe("asset/fiat landing page");
    expect(
      classifyCompetitorPageType({
        url: "https://banxa.com/business",
        title: "Business crypto payments",
      }),
    ).toBe("business/enterprise");
  });
});

describe("summarizeCompetitorAuditChanges", () => {
  it("detects added, removed, and materially changed pages between audits", () => {
    const result = summarizeCompetitorAuditChanges({
      currentAudit: {
        id: "audit_current",
        startedAt: "2026-07-21T00:00:00.000Z",
      },
      previousAudit: {
        id: "audit_previous",
        startedAt: "2026-07-14T00:00:00.000Z",
      },
      currentPages: [
        {
          url: "https://mudrex.com/usdt-inr",
          title: "USDT to INR | Mudrex",
          metaDescription: "Instant USDT to INR",
          wordCount: 800,
          contentHash: "hash-a",
          statusCode: 200,
        },
        {
          url: "https://mudrex.com/blog/new-regulation-guide",
          title: "New Regulation Guide",
          metaDescription: "Guide",
          wordCount: 1400,
          contentHash: "hash-new",
          statusCode: 200,
        },
      ],
      previousPages: [
        {
          url: "https://mudrex.com/usdt-inr",
          title: "USDT to INR | Mudrex",
          metaDescription: "Instant USDT to INR",
          wordCount: 500,
          contentHash: "hash-old",
          statusCode: 200,
        },
        {
          url: "https://mudrex.com/old-page",
          title: "Old page",
          metaDescription: "Old",
          wordCount: 300,
          contentHash: "hash-removed",
          statusCode: 200,
        },
      ],
      limit: 20,
    });

    expect(result.summary).toMatchObject({
      total: 3,
      added: 1,
      removed: 1,
      materiallyChanged: 1,
    });
    expect(result.changes.map((change) => change.changeType)).toEqual(
      expect.arrayContaining(["added", "removed", "materially_changed"]),
    );
    expect(
      result.changes.find((change) => change.url === "https://mudrex.com/usdt-inr"),
    ).toMatchObject({
      pageType: "asset/fiat landing page",
      changeType: "materially_changed",
    });
  });

  it("returns an empty change set when no previous audit exists", () => {
    const result = summarizeCompetitorAuditChanges({
      currentAudit: {
        id: "audit_current",
        startedAt: "2026-07-21T00:00:00.000Z",
      },
      previousAudit: null,
      currentPages: [
        {
          url: "https://banxa.com/",
          title: "Banxa",
          metaDescription: null,
          wordCount: 250,
          contentHash: "home",
          statusCode: 200,
        },
      ],
      previousPages: [],
      limit: 10,
    });

    expect(result.summary.total).toBe(0);
    expect(result.changes).toEqual([]);
    expect(result.previousAuditId).toBeNull();
  });
});
