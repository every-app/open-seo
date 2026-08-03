import { describe, expect, it, vi } from "vitest";
import type { RapidapiSnapshot } from "@/server/features/revenue/repositories/RapidapiSnapshotRepository";
import { buildSnapshotReport } from "./RapidapiService";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/revenue/repositories/RapidapiSnapshotRepository",
  () => ({ RapidapiSnapshotRepository: {} }),
);

function snapshot(overrides: Partial<RapidapiSnapshot>): RapidapiSnapshot {
  return {
    id: crypto.randomUUID(),
    projectId: "p1",
    organizationId: "org1",
    capturedOn: "2026-08-04",
    activeSubscribers: 4,
    payingSubscribers: 1,
    createdByUserId: "u1",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSnapshotReport", () => {
  it("returns nulls with no snapshots", () => {
    const report = buildSnapshotReport([]);
    expect(report.latest).toBeNull();
    expect(report.activeDelta).toBeNull();
  });

  it("has no deltas with a single snapshot", () => {
    const report = buildSnapshotReport([snapshot({})]);
    expect(report.latest?.activeSubscribers).toBe(4);
    expect(report.previous).toBeNull();
    expect(report.activeDelta).toBeNull();
    expect(report.payingDelta).toBeNull();
  });

  it("computes deltas between the two most recent snapshots", () => {
    const report = buildSnapshotReport([
      snapshot({
        capturedOn: "2026-08-04",
        activeSubscribers: 6,
        payingSubscribers: 3,
      }),
      snapshot({
        capturedOn: "2026-07-28",
        activeSubscribers: 4,
        payingSubscribers: 1,
      }),
      snapshot({
        capturedOn: "2026-07-01",
        activeSubscribers: 9,
        payingSubscribers: 9,
      }),
    ]);
    expect(report.activeDelta).toBe(2);
    expect(report.payingDelta).toBe(2);
  });

  it("skips the paying delta when either snapshot lacks the split", () => {
    const report = buildSnapshotReport([
      snapshot({ payingSubscribers: 3 }),
      snapshot({ capturedOn: "2026-07-28", payingSubscribers: null }),
    ]);
    expect(report.activeDelta).toBe(0);
    expect(report.payingDelta).toBeNull();
  });
});
