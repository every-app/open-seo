import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { DomainOverviewSnapshotRepository } from "./domain-overview-snapshot-repository";

function mockRows(rows: unknown[]) {
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
}

describe("DomainOverviewSnapshotRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a fresh organization-scoped snapshot", async () => {
    mockRows([
      {
        id: 2,
        organicTraffic: 1234.5,
        organicKeywords: 57,
        fetchedAt: "2026-08-10T12:00:00.000Z",
      },
    ]);

    await expect(
      DomainOverviewSnapshotRepository.getFresh({
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        now: Date.parse("2026-08-12T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      organicTraffic: 1234.5,
      organicKeywords: 57,
      fetchedAt: "2026-08-10T12:00:00.000Z",
    });
  });

  it("treats a snapshot at the seven-day boundary as stale", async () => {
    mockRows([
      {
        id: 2,
        organicTraffic: 1,
        organicKeywords: 1,
        fetchedAt: "2026-08-05T12:00:00.000Z",
      },
    ]);

    await expect(
      DomainOverviewSnapshotRepository.getFresh({
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        now: Date.parse("2026-08-12T12:00:00.000Z"),
      }),
    ).resolves.toBeNull();
  });

  it("returns null for a missing snapshot", async () => {
    mockRows([]);

    await expect(
      DomainOverviewSnapshotRepository.getFresh({
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).resolves.toBeNull();
  });

  it("writes only normalized metrics and dimensions", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    mocks.db.insert.mockReturnValue({ values });

    await DomainOverviewSnapshotRepository.insert({
      organizationId: "org-1",
      domain: "example.com",
      locationCode: 2840,
      languageCode: "en",
      organicTraffic: 10,
      organicKeywords: null,
    });

    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        organicTraffic: 10,
        organicKeywords: null,
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher
        fetchedAt: expect.any(String),
      }),
    );
  });
});
