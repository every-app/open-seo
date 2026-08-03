import { describe, expect, it, vi } from "vitest";
import type { RapidapiSubscription } from "@/server/lib/rapidapiClient";
import { computeRapidapiMetrics, scopeToApi } from "./RapidapiService";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/revenue/repositories/RapidapiConnectionRepository",
  () => ({ RapidapiConnectionRepository: {} }),
);

const NOW = new Date("2026-08-03T00:00:00.000Z");

function sub(overrides: Partial<RapidapiSubscription>): RapidapiSubscription {
  return {
    id: crypto.randomUUID(),
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    canceledAt: null,
    entityType: "User",
    entityId: "user_1",
    apiId: "api_ss",
    apiName: "scholar-sidekick",
    planName: "BASIC",
    planPrice: 0,
    ...overrides,
  };
}

describe("computeRapidapiMetrics", () => {
  it("counts active and paying subscribers", () => {
    const metrics = computeRapidapiMetrics(
      [
        sub({ planName: "PRO", planPrice: 25 }),
        sub({}),
        sub({
          status: "CANCELED",
          canceledAt: "2026-05-01T00:00:00.000Z",
          planPrice: 25,
        }),
      ],
      true,
      NOW,
    );
    expect(metrics.activeSubscribers).toBe(2);
    expect(metrics.payingSubscribers).toBe(1);
  });

  it("reports paying as null when plan info is unavailable", () => {
    const metrics = computeRapidapiMetrics(
      [sub({ planName: null, planPrice: null })],
      false,
      NOW,
    );
    expect(metrics.activeSubscribers).toBe(1);
    expect(metrics.payingSubscribers).toBeNull();
  });

  it("windows new and churned into last-30 and prior-30 buckets", () => {
    const metrics = computeRapidapiMetrics(
      [
        // created 10 days ago → newLast30
        sub({ createdAt: "2026-07-24T00:00:00.000Z" }),
        // created 45 days ago → newPrev30
        sub({ createdAt: "2026-06-19T00:00:00.000Z" }),
        // created 90 days ago, canceled 5 days ago → churnedLast30
        sub({
          createdAt: "2026-05-05T00:00:00.000Z",
          canceledAt: "2026-07-29T00:00:00.000Z",
          status: "CANCELED",
        }),
        // canceled 40 days ago → churnedPrev30
        sub({
          createdAt: "2026-01-01T00:00:00.000Z",
          canceledAt: "2026-06-24T00:00:00.000Z",
          status: "CANCELED",
        }),
      ],
      true,
      NOW,
    );
    expect(metrics.newLast30).toBe(1);
    expect(metrics.newPrev30).toBe(1);
    expect(metrics.churnedLast30).toBe(1);
    expect(metrics.churnedPrev30).toBe(1);
  });

  it("treats non-ACTIVE statuses without canceledAt as inactive", () => {
    // Observed live: plan-switched rows arrive as DELETED with canceledAt
    // null — only an explicit ACTIVE counts.
    const metrics = computeRapidapiMetrics(
      [
        sub({ status: "DELETED", canceledAt: null }),
        sub({ status: "CANCELLED", canceledAt: null }),
      ],
      true,
      NOW,
    );
    expect(metrics.activeSubscribers).toBe(0);
  });
});

describe("scopeToApi", () => {
  it("drops nodes that belong to other APIs (ignored-filter fallback)", () => {
    // The Platform API silently ignores an unknown where.apiId and returns
    // the caller's own subscriptions — those must not be counted.
    const scoped = scopeToApi(
      [
        sub({ apiId: "api_ss" }),
        sub({ apiId: "api_other" }),
        sub({ apiId: null }),
      ],
      "api_ss",
    );
    expect(scoped).toHaveLength(2);
    expect(scoped.every((s) => s.apiId !== "api_other")).toBe(true);
  });
});
