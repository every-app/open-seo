import { AppError } from "@/server/lib/errors";
import {
  FIRST_PARTY_RETENTION_DAYS,
  type FirstPartyAggregateSnapshot,
} from "@/shared/first-party-signals";
import { FirstPartyCredentialVault } from "./FirstPartyCredentialVault";
import { FirstPartyReportingService } from "./FirstPartyReportingService";
import {
  normalizeAllowedPaths,
  normalizePublicLandingPath,
} from "./FirstPartyPathPolicy";
import { FirstPartySignalsRepository } from "./FirstPartySignalsRepository";
import { randomBase64Url } from "./encoding";

const BATCH_LEASE_MS = 5 * 60_000;
const MIN_RETRY_AFTER_SECONDS = 1;
const FIRST_PARTY_RETENTION_PURGE_PAGE_SIZE = 250;
const MAX_RETENTION_PURGE_PAGE_SIZE = 500;

export class FirstPartyBatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirstPartyBatchConflictError";
  }
}

export class FirstPartyBatchInProgressError extends Error {
  readonly retryAfterSeconds: number;
  readonly rowCount: number;

  constructor(input: {
    retryAfterSeconds: number;
    rowCount: number;
    message?: string;
  }) {
    super(input.message ?? "This exact batch is still being processed.");
    this.name = "FirstPartyBatchInProgressError";
    this.retryAfterSeconds = Math.max(
      MIN_RETRY_AFTER_SECONDS,
      Math.ceil(input.retryAfterSeconds),
    );
    this.rowCount = input.rowCount;
  }
}

function batchLeaseExpiry(now: Date) {
  return new Date(now.getTime() + BATCH_LEASE_MS).toISOString();
}

function retryAfterSeconds(receipt: BatchReceipt | null, now: Date): number {
  const expiresAt = receipt?.processingLeaseExpiresAt
    ? Date.parse(receipt.processingLeaseExpiresAt)
    : Number.NaN;
  if (!Number.isFinite(expiresAt)) return MIN_RETRY_AFTER_SECONDS;
  return Math.max(
    MIN_RETRY_AFTER_SECONDS,
    Math.ceil((expiresAt - now.getTime()) / 1_000),
  );
}

function inProgress(receipt: BatchReceipt | null, rowCount: number, now: Date) {
  return new FirstPartyBatchInProgressError({
    retryAfterSeconds: retryAfterSeconds(receipt, now),
    rowCount,
  });
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function oldestRetainedDay(now: Date): string {
  const oldest = new Date(now);
  oldest.setUTCDate(oldest.getUTCDate() - FIRST_PARTY_RETENTION_DAYS);
  return isoDay(oldest);
}

function validateSnapshotDate(snapshotDate: string, now: Date) {
  const oldest = oldestRetainedDay(now);
  const today = isoDay(now);
  if (snapshotDate > today || snapshotDate < oldest) {
    throw new AppError(
      "VALIDATION_ERROR",
      `snapshotDate must be between ${oldest} and ${today}.`,
    );
  }
}

type IngestSource = NonNullable<
  Awaited<
    ReturnType<typeof FirstPartySignalsRepository.getActiveSourceForIngest>
  >
>;
type BatchReceipt = NonNullable<
  Awaited<ReturnType<typeof FirstPartySignalsRepository.getBatch>>
>;

function normalizeCompleteRows(
  source: IngestSource,
  snapshot: FirstPartyAggregateSnapshot,
) {
  const normalizedRows = snapshot.rows.map((row) => {
    const landingPath = normalizePublicLandingPath({
      value: row.landingPath,
      projectDomain: source.projectDomain,
      allowedPaths: source.allowedPaths,
    });
    if (!landingPath) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Every landingPath must be an allowlisted public pathname without identifiers.",
      );
    }
    return { ...row, landingPath };
  });
  const receivedPaths = new Set(normalizedRows.map((row) => row.landingPath));
  if (receivedPaths.size !== normalizedRows.length) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A snapshot cannot contain duplicate canonical landing paths.",
    );
  }
  if (
    receivedPaths.size !== source.allowedPaths.length ||
    source.allowedPaths.some((path) => !receivedPaths.has(path))
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A complete daily snapshot must contain every configured landing path exactly once.",
    );
  }
  return normalizedRows;
}

function compatibleReceipt(
  byBatch: BatchReceipt | null,
  byDate: BatchReceipt | null,
  snapshot: FirstPartyAggregateSnapshot,
): BatchReceipt | null {
  if (
    (byBatch && byBatch.snapshotDate !== snapshot.snapshotDate) ||
    (byDate && byDate.batchId !== snapshot.batchId) ||
    (byBatch && byDate && byBatch.id !== byDate.id)
  ) {
    throw new FirstPartyBatchConflictError(
      "Each source accepts exactly one immutable batch per UTC day.",
    );
  }
  return byBatch ?? byDate;
}

async function configureSource(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  name: string;
  allowedPaths: string[];
}) {
  if (!(await FirstPartyCredentialVault.isConfigured())) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Set BETTER_AUTH_SECRET to at least 32 characters before creating an aggregate source.",
    );
  }
  let allowedPaths: string[];
  try {
    allowedPaths = normalizeAllowedPaths(input.allowedPaths);
  } catch (error) {
    throw new AppError(
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Invalid public landing paths.",
    );
  }
  const secret = randomBase64Url(32);
  const now = new Date().toISOString();
  const sourceId = await FirstPartySignalsRepository.upsertSource({
    projectId: input.projectId,
    organizationId: input.organizationId,
    name: input.name.trim(),
    encryptedSecret: await FirstPartyCredentialVault.encrypt(secret),
    secretHint: `••••${secret.slice(-6)}`,
    createdByUserId: input.userId,
    allowedPaths,
    now,
  });
  return {
    sourceId,
    secret,
    secretShownOnce: true as const,
    allowedPaths,
    signature: "hex(HMAC-SHA256(secret, timestamp + '.' + exactRawBody))",
  };
}

async function listSources(projectId: string) {
  return FirstPartySignalsRepository.listSources(projectId);
}

async function revokeSource(projectId: string, sourceId: string) {
  const revoked = await FirstPartySignalsRepository.revokeSource(
    projectId,
    sourceId,
    new Date().toISOString(),
  );
  if (!revoked) throw new AppError("NOT_FOUND", "Aggregate source not found.");
}

async function saveSnapshot(input: {
  source: IngestSource;
  snapshot: FirstPartyAggregateSnapshot;
  payloadDigest: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  validateSnapshotDate(input.snapshot.snapshotDate, now);
  const normalizedRows = normalizeCompleteRows(input.source, input.snapshot);
  const [byBatch, byDate] = await Promise.all([
    FirstPartySignalsRepository.getBatch(
      input.source.id,
      input.snapshot.batchId,
    ),
    FirstPartySignalsRepository.getBatchForDate(
      input.source.id,
      input.snapshot.snapshotDate,
    ),
  ]);
  const receipt = compatibleReceipt(byBatch, byDate, input.snapshot);
  if (receipt && receipt.payloadDigest !== input.payloadDigest) {
    throw new FirstPartyBatchConflictError(
      "batchId was already used with a different exact payload.",
    );
  }
  if (receipt?.status === "complete") {
    return {
      accepted: true as const,
      duplicate: true as const,
      rowCount: normalizedRows.length,
    };
  }

  const nowIso = now.toISOString();
  const leaseId = crypto.randomUUID();
  const leaseExpiresAt = batchLeaseExpiry(now);
  let receiptId = receipt?.id;
  if (receipt) {
    if (
      !(await FirstPartySignalsRepository.claimBatchForProcessing({
        id: receipt.id,
        payloadDigest: input.payloadDigest,
        leaseId,
        leaseExpiresAt,
        now: nowIso,
      }))
    ) {
      throw inProgress(receipt, normalizedRows.length, now);
    }
  } else {
    try {
      receiptId = await FirstPartySignalsRepository.createBatch({
        sourceId: input.source.id,
        batchId: input.snapshot.batchId,
        snapshotDate: input.snapshot.snapshotDate,
        payloadDigest: input.payloadDigest,
        leaseId,
        leaseExpiresAt,
        now: nowIso,
      });
    } catch (error) {
      const [racedByBatch, racedByDate] = await Promise.all([
        FirstPartySignalsRepository.getBatch(
          input.source.id,
          input.snapshot.batchId,
        ),
        FirstPartySignalsRepository.getBatchForDate(
          input.source.id,
          input.snapshot.snapshotDate,
        ),
      ]);
      const raced = compatibleReceipt(
        racedByBatch,
        racedByDate,
        input.snapshot,
      );
      if (
        raced?.payloadDigest === input.payloadDigest &&
        raced.status === "complete"
      ) {
        return {
          accepted: true as const,
          duplicate: true as const,
          rowCount: normalizedRows.length,
        };
      }
      if (raced && raced.payloadDigest !== input.payloadDigest) {
        throw new FirstPartyBatchConflictError(
          "batchId was already used with a different exact payload.",
        );
      }
      if (
        raced?.payloadDigest === input.payloadDigest &&
        (await FirstPartySignalsRepository.claimBatchForProcessing({
          id: raced.id,
          payloadDigest: input.payloadDigest,
          leaseId,
          leaseExpiresAt,
          now: nowIso,
        }))
      ) {
        receiptId = raced.id;
      } else if (raced) {
        throw inProgress(raced, normalizedRows.length, now);
      } else {
        throw error;
      }
    }
  }
  if (!receiptId) throw new Error("Aggregate batch receipt was not created.");

  try {
    if (
      !(await FirstPartySignalsRepository.renewBatchLease({
        id: receiptId,
        leaseId,
        now: nowIso,
        leaseExpiresAt: batchLeaseExpiry(now),
      }))
    ) {
      throw inProgress(receipt, normalizedRows.length, now);
    }
    await FirstPartySignalsRepository.replaceBatchRows({
      batchReceiptId: receiptId,
      processingAttemptId: leaseId,
      rows: normalizedRows,
      now: nowIso,
    });
    const completionNow = new Date();
    if (
      !(await FirstPartySignalsRepository.renewBatchLease({
        id: receiptId,
        leaseId,
        now: completionNow.toISOString(),
        leaseExpiresAt: batchLeaseExpiry(completionNow),
      }))
    ) {
      throw inProgress(receipt, normalizedRows.length, completionNow);
    }
    if (
      !(await FirstPartySignalsRepository.completeBatch({
        batchReceiptId: receiptId,
        leaseId,
        now: completionNow.toISOString(),
      }))
    ) {
      throw inProgress(receipt, normalizedRows.length, completionNow);
    }
  } catch (error) {
    await FirstPartySignalsRepository.failBatch(
      receiptId,
      leaseId,
      new Date().toISOString(),
    );
    throw error;
  }
  return {
    accepted: true as const,
    duplicate: false as const,
    rowCount: normalizedRows.length,
  };
}

async function purgeExpired(
  input: {
    now?: Date;
    limit?: number;
    projectId?: string;
  } = {},
) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? FIRST_PARTY_RETENTION_PURGE_PAGE_SIZE;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_RETENTION_PURGE_PAGE_SIZE
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Retention cleanup limit must be between 1 and ${MAX_RETENTION_PURGE_PAGE_SIZE}.`,
    );
  }
  const result = await FirstPartySignalsRepository.purgeOlderThan({
    cutoffDate: oldestRetainedDay(now),
    limit,
    projectId: input.projectId,
  });
  return {
    ...result,
    cutoffDate: oldestRetainedDay(now),
    limit,
  };
}

export const FirstPartySignalsService = {
  configureSource,
  listSources,
  revokeSource,
  saveSnapshot,
  purgeExpired,
  ...FirstPartyReportingService,
};
