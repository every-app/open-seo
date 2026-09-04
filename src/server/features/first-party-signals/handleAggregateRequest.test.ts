import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_PARTY_MAX_BODY_BYTES } from "@/shared/first-party-signals";
import { bytesToHex } from "./encoding";
import { handleFirstPartyAggregateRequest } from "./handleAggregateRequest";

type RateLimitFn = (input: { key: string }) => Promise<{ success: boolean }>;

const runtime = vi.hoisted(() => ({
  env: {} as {
    FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED?: string;
    FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT?: {
      limit: RateLimitFn;
    };
    FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT?: {
      limit: RateLimitFn;
    };
    FIRST_PARTY_INGEST_RATE_LIMIT?: { limit: RateLimitFn };
  },
}));

vi.mock("cloudflare:workers", () => runtime);

const mocks = vi.hoisted(() => ({
  getActiveSourceForIngest: vi.fn(),
  decrypt: vi.fn(),
  saveSnapshot: vi.fn<
    (input: { snapshot: unknown; payloadDigest: string }) => Promise<{
      accepted: true;
      duplicate: boolean;
      rowCount: number;
    }>
  >(),
}));

vi.mock("./FirstPartySignalsRepository", () => ({
  FirstPartySignalsRepository: {
    getActiveSourceForIngest: mocks.getActiveSourceForIngest,
  },
}));

vi.mock("./FirstPartyCredentialVault", () => ({
  FirstPartyCredentialVault: { decrypt: mocks.decrypt },
}));

vi.mock("./FirstPartySignalsService", () => {
  class FirstPartyBatchConflictError extends Error {}
  class FirstPartyBatchInProgressError extends Error {
    retryAfterSeconds: number;
    rowCount: number;

    constructor(input: { retryAfterSeconds: number; rowCount: number }) {
      super("in progress");
      this.retryAfterSeconds = input.retryAfterSeconds;
      this.rowCount = input.rowCount;
    }
  }
  return {
    FirstPartyBatchConflictError,
    FirstPartyBatchInProgressError,
    FirstPartySignalsService: { saveSnapshot: mocks.saveSnapshot },
  };
});

const sourceId = "2d7b09d4-884c-4b99-a2ca-56fd514fb710";
const secret = "test-secret";

async function sign(timestamp: string, rawBody: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + rawBody.length);
  message.set(prefix);
  message.set(rawBody, prefix.length);
  return bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, message)),
  );
}

async function signedRequest(value: unknown, rawBody?: string) {
  const body = new TextEncoder().encode(rawBody ?? JSON.stringify(value));
  const timestamp = String(Date.now());
  return new Request("https://app.example.com/api/site-signals/v1/aggregates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenSEO-Source": sourceId,
      "X-OpenSEO-Timestamp": timestamp,
      "X-OpenSEO-Signature": await sign(timestamp, body),
    },
    body,
  });
}

const payload = {
  schemaVersion: 1,
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
  delete runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED;
  delete runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT;
  delete runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT;
  delete runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT;
  mocks.getActiveSourceForIngest.mockResolvedValue({
    id: sourceId,
    projectId: "project_1",
    encryptedSecret: "encrypted",
    projectDomain: "example.com",
    allowedPaths: ["/pricing"],
  });
  mocks.decrypt.mockResolvedValue(secret);
  mocks.saveSnapshot.mockResolvedValue({
    accepted: true,
    duplicate: false,
    rowCount: 1,
  });
});

describe("first-party aggregate HTTP ingestion", () => {
  it("authenticates the exact bytes before accepting a snapshot", async () => {
    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      accepted: true,
      duplicate: false,
      rowCount: 1,
    });
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: payload,
      }),
    );
    expect(mocks.saveSnapshot.mock.calls[0]?.[0].payloadDigest).toMatch(
      /^[a-f\d]{64}$/,
    );
  });

  it("returns 200 for an exact idempotent replay", async () => {
    mocks.saveSnapshot.mockResolvedValue({
      accepted: true,
      duplicate: true,
      rowCount: 1,
    });
    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true });
  });

  it("returns retryable 202 while the exact batch is still pending", async () => {
    const { FirstPartyBatchInProgressError } =
      await import("./FirstPartySignalsService");
    mocks.saveSnapshot.mockRejectedValue(
      new FirstPartyBatchInProgressError({
        retryAfterSeconds: 47,
        rowCount: 1,
      }),
    );

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Retry-After")).toBe("47");
    expect(await response.json()).toEqual({
      ok: true,
      accepted: true,
      duplicate: true,
      status: "in_progress",
      rowCount: 1,
    });
  });

  it("reserves 409 for conflicting immutable batch identity or bytes", async () => {
    const { FirstPartyBatchConflictError } =
      await import("./FirstPartySignalsService");
    mocks.saveSnapshot.mockRejectedValue(
      new FirstPartyBatchConflictError("different digest or date"),
    );

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(await response.json()).toEqual({
      ok: false,
      error: "BATCH_CONFLICT",
    });
  });

  it("rate-limits an authenticated source before parsing or persistence", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT = { limit };

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: sourceId });
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("bounds a burst of random claimed UUIDs before body, database, or secret work", async () => {
    const globalLimit = vi
      .fn<RateLimitFn>()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: false });
    const claimedSourceLimit = vi
      .fn<RateLimitFn>()
      .mockResolvedValue({ success: true });
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = { limit: globalLimit };
    runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = {
      limit: claimedSourceLimit,
    };
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };

    let bodyPulls = 0;
    const responses: Response[] = [];
    for (let index = 0; index < 6; index += 1) {
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            bodyPulls += 1;
            controller.enqueue(new TextEncoder().encode("{}"));
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      responses.push(
        await handleFirstPartyAggregateRequest(
          new Request(
            "https://app.example.com/api/site-signals/v1/aggregates",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-OpenSEO-Source": crypto.randomUUID(),
              },
              body,
              duplex: "half",
            } as RequestInit & { duplex: "half" },
          ),
        ),
      );
    }

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 429, 429, 429, 429,
    ]);
    expect(globalLimit).toHaveBeenCalledTimes(6);
    expect(claimedSourceLimit).toHaveBeenCalledTimes(2);
    expect(globalLimit.mock.calls.map(([input]) => input.key)).toEqual(
      Array.from({ length: 6 }, () => "aggregate-receiver"),
    );
    const claimedKeys = claimedSourceLimit.mock.calls.map(
      ([input]) => input.key,
    );
    expect(new Set(claimedKeys).size).toBe(2);
    expect(claimedKeys.every((key) => /^[0-9a-f-]{36}$/.test(key))).toBe(true);
    expect(bodyPulls).toBe(0);
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("fails closed before body or database work when an edge binding is missing", async () => {
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toMatchObject({
      error: "INGEST_PROTECTION_UNAVAILABLE",
    });
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("fails closed when the coarse edge limiter is unavailable", async () => {
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = {
      limit: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );

    expect(response.status).toBe(503);
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it("rejects a signature made for different JSON bytes", async () => {
    const signed = await signedRequest(payload);
    const headers = new Headers(signed.headers);
    const response = await handleFirstPartyAggregateRequest(
      new Request(signed.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload, null, 2),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects unknown fields instead of accepting PII or amounts", async () => {
    const response = await handleFirstPartyAggregateRequest(
      await signedRequest({
        ...payload,
        rows: [{ ...payload.rows[0], email: "person@example.com", amount: 10 }],
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "VALIDATION_ERROR",
    });
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("caps a streaming body before signature or JSON processing", async () => {
    const response = await handleFirstPartyAggregateRequest(
      new Request("https://app.example.com/api/site-signals/v1/aggregates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenSEO-Source": sourceId,
          "X-OpenSEO-Timestamp": String(Date.now()),
          "X-OpenSEO-Signature": "00".repeat(32),
        },
        body: "x".repeat(FIRST_PARTY_MAX_BODY_BYTES + 1),
      }),
    );
    expect(response.status).toBe(413);
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
  });

  it("does not distinguish an unknown or revoked source from a bad signature", async () => {
    mocks.getActiveSourceForIngest.mockResolvedValue(null);
    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(payload),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "INVALID_SIGNATURE",
    });
  });
});
