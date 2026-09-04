import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirstPartyBatchConflictError,
  FirstPartyBatchInProgressError,
  FirstPartySignalsService,
} from "./FirstPartySignalsService";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  encrypt: vi.fn(),
  upsertSource: vi.fn(),
  listSources: vi.fn(),
  revokeSource: vi.fn(),
  getBatch: vi.fn(),
  getBatchForDate: vi.fn(),
  createBatch: vi.fn(),
  claimBatchForProcessing: vi.fn(),
  renewBatchLease: vi.fn(),
  replaceBatchRows:
    vi.fn<(input: { processingAttemptId: string }) => Promise<void>>(),
  completeBatch: vi.fn<(input: { leaseId: string }) => Promise<boolean>>(),
  failBatch: vi.fn(),
  purgeOlderThan: vi.fn(),
}));

vi.mock("./FirstPartyCredentialVault", () => ({
  FirstPartyCredentialVault: {
    isConfigured: mocks.isConfigured,
    encrypt: mocks.encrypt,
  },
}));

vi.mock("./FirstPartySignalsRepository", () => ({
  FirstPartySignalsRepository: {
    upsertSource: mocks.upsertSource,
    listSources: mocks.listSources,
    revokeSource: mocks.revokeSource,
    getBatch: mocks.getBatch,
    getBatchForDate: mocks.getBatchForDate,
    createBatch: mocks.createBatch,
    claimBatchForProcessing: mocks.claimBatchForProcessing,
    renewBatchLease: mocks.renewBatchLease,
    replaceBatchRows: mocks.replaceBatchRows,
    completeBatch: mocks.completeBatch,
    failBatch: mocks.failBatch,
    purgeOlderThan: mocks.purgeOlderThan,
  },
}));

const source = {
  id: "2d7b09d4-884c-4b99-a2ca-56fd514fb710",
  projectId: "project_1",
  encryptedSecret: "encrypted",
  projectDomain: "www.example.com",
  allowedPaths: ["/pricing"],
};

const snapshot = {
  schemaVersion: 1 as const,
  batchId: "f1a2ae17-b157-4bb9-b1a1-960ce8d4c01d",
  snapshotDate: "2026-09-04",
  rows: [
    {
      landingPath: "/pricing",
      searchStarted: 10,
      searchCompleted: 8,
      searchNoResults: 1,
      registrationsCompleted: 3,
      checkoutStarted: 2,
      paymentsCompleted: 1,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isConfigured.mockResolvedValue(true);
  mocks.encrypt.mockImplementation((secret: string) =>
    Promise.resolve(`encrypted:${secret}`),
  );
  mocks.upsertSource.mockResolvedValue(source.id);
  mocks.getBatch.mockResolvedValue(null);
  mocks.getBatchForDate.mockResolvedValue(null);
  mocks.createBatch.mockResolvedValue("receipt_1");
  mocks.claimBatchForProcessing.mockResolvedValue(false);
  mocks.renewBatchLease.mockResolvedValue(true);
  mocks.completeBatch.mockResolvedValue(true);
});

describe("FirstPartySignalsService", () => {
  it("creates a 256-bit secret and returns it only in the creation response", async () => {
    const result = await FirstPartySignalsService.configureSource({
      projectId: "project_1",
      organizationId: "org_1",
      userId: "user_1",
      name: "website",
      allowedPaths: ["/", "/pricing"],
    });

    expect(result.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.secretShownOnce).toBe(true);
    expect(mocks.encrypt).toHaveBeenCalledWith(result.secret);
    expect(mocks.upsertSource).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedSecret: `encrypted:${result.secret}`,
        allowedPaths: ["/", "/pricing"],
      }),
    );
  });

  it("persists one recoverable, current snapshot", async () => {
    const result = await FirstPartySignalsService.saveSnapshot({
      source,
      snapshot,
      payloadDigest: "digest_1",
      now: new Date("2026-09-04T12:00:00.000Z"),
    });

    expect(result).toEqual({
      accepted: true,
      duplicate: false,
      rowCount: 1,
    });
    expect(mocks.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: source.id,
        snapshotDate: "2026-09-04",
        payloadDigest: "digest_1",
      }),
    );
    expect(mocks.replaceBatchRows).toHaveBeenCalledWith(
      expect.objectContaining({
        batchReceiptId: "receipt_1",
        rows: snapshot.rows,
      }),
    );
    expect(mocks.completeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        batchReceiptId: "receipt_1",
      }),
    );
    expect(mocks.replaceBatchRows.mock.calls[0]?.[0].processingAttemptId).toBe(
      mocks.completeBatch.mock.calls[0]?.[0].leaseId,
    );
  });

  it("treats an already-complete exact batch as an idempotent replay", async () => {
    mocks.getBatch.mockResolvedValue({
      id: "receipt_1",
      status: "complete",
      payloadDigest: "digest_1",
      batchId: snapshot.batchId,
      snapshotDate: snapshot.snapshotDate,
    });

    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot,
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ accepted: true, duplicate: true, rowCount: 1 });
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(mocks.replaceBatchRows).not.toHaveBeenCalled();
  });

  it("reports an exact active pending retry as in progress, not a conflict", async () => {
    mocks.getBatch.mockResolvedValue({
      id: "receipt_1",
      status: "pending",
      payloadDigest: "digest_1",
      batchId: snapshot.batchId,
      snapshotDate: snapshot.snapshotDate,
      processingLeaseExpiresAt: "2026-09-04T12:00:47.000Z",
    });

    const result = FirstPartySignalsService.saveSnapshot({
      source,
      snapshot,
      payloadDigest: "digest_1",
      now: new Date("2026-09-04T12:00:00.000Z"),
    });

    await expect(result).rejects.toMatchObject({
      name: "FirstPartyBatchInProgressError",
      retryAfterSeconds: 47,
      rowCount: 1,
    });
    await expect(result).rejects.toBeInstanceOf(FirstPartyBatchInProgressError);
    expect(mocks.createBatch).not.toHaveBeenCalled();
    expect(mocks.replaceBatchRows).not.toHaveBeenCalled();
  });

  it("reports an exact create race as in progress when the winner is pending", async () => {
    const racedReceipt = {
      id: "receipt_raced",
      status: "pending",
      payloadDigest: "digest_1",
      batchId: snapshot.batchId,
      snapshotDate: snapshot.snapshotDate,
      processingLeaseExpiresAt: "2026-09-04T12:00:30.000Z",
    };
    mocks.getBatch
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedReceipt);
    mocks.getBatchForDate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(racedReceipt);
    mocks.createBatch.mockRejectedValue(new Error("unique constraint"));

    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot,
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "FirstPartyBatchInProgressError",
      retryAfterSeconds: 30,
    });
    expect(mocks.replaceBatchRows).not.toHaveBeenCalled();
  });

  it("rejects reusing a batch id with different exact bytes", async () => {
    mocks.getBatch.mockResolvedValue({
      id: "receipt_1",
      status: "complete",
      payloadDigest: "different_digest",
      batchId: snapshot.batchId,
      snapshotDate: snapshot.snapshotDate,
    });

    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot,
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FirstPartyBatchConflictError);
  });

  it("accepts only one immutable batch per source and UTC day", async () => {
    mocks.getBatchForDate.mockResolvedValue({
      id: "receipt_existing",
      status: "complete",
      payloadDigest: "digest_existing",
      batchId: "d86f8d99-b59d-486a-a47c-ab790dece71c",
      snapshotDate: snapshot.snapshotDate,
    });

    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot,
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(FirstPartyBatchConflictError);
    expect(mocks.createBatch).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted and identifier-shaped landing paths", async () => {
    for (const landingPath of [
      "/account",
      "/orders/12345678",
      "/people/6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    ]) {
      await expect(
        FirstPartySignalsService.saveSnapshot({
          source: { ...source, allowedPaths: [landingPath] },
          snapshot: {
            ...snapshot,
            rows: [{ ...snapshot.rows[0], landingPath }],
          },
          payloadDigest: "digest_1",
          now: new Date("2026-09-04T12:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ name: "AppError", code: "VALIDATION_ERROR" });
    }
    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot: {
          ...snapshot,
          rows: [{ ...snapshot.rows[0], landingPath: "/pricing/team" }],
        },
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "AppError", code: "VALIDATION_ERROR" });
    expect(mocks.getBatch).not.toHaveBeenCalled();
  });

  it("rejects a partial daily snapshot", async () => {
    await expect(
      FirstPartySignalsService.saveSnapshot({
        source: { ...source, allowedPaths: ["/", "/pricing"] },
        snapshot,
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "AppError", code: "VALIDATION_ERROR" });
    expect(mocks.getBatch).not.toHaveBeenCalled();
  });

  it("enforces and purges the 400-day retention window", async () => {
    mocks.purgeOlderThan
      .mockResolvedValueOnce({ deleted: 25, hasMore: true })
      .mockResolvedValueOnce({ deleted: 4, hasMore: false });
    await expect(
      FirstPartySignalsService.purgeExpired({
        now: new Date("2026-09-04T12:00:00.000Z"),
        limit: 25,
        projectId: "project_1",
      }),
    ).resolves.toEqual({
      deleted: 29,
      pages: 2,
      hasMore: false,
      stalled: false,
      cutoffDate: "2025-07-31",
      limit: 25,
      maxPages: 20,
      capacity: 500,
    });
    expect(mocks.purgeOlderThan).toHaveBeenCalledTimes(2);
    expect(mocks.purgeOlderThan).toHaveBeenNthCalledWith(1, {
      cutoffDate: "2025-07-31",
      limit: 25,
      projectId: "project_1",
    });
    expect(mocks.purgeOlderThan).toHaveBeenNthCalledWith(2, {
      cutoffDate: "2025-07-31",
      limit: 25,
      projectId: "project_1",
    });
    await expect(
      FirstPartySignalsService.purgeExpired({ limit: 501 }),
    ).rejects.toMatchObject({ name: "AppError", code: "VALIDATION_ERROR" });

    await expect(
      FirstPartySignalsService.saveSnapshot({
        source,
        snapshot: { ...snapshot, snapshotDate: "2025-07-30" },
        payloadDigest: "digest_1",
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ name: "AppError", code: "VALIDATION_ERROR" });
  });
});
