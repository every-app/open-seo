import { beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "./encoding";
import { handleFirstPartyAggregateRequest } from "./handleAggregateRequest";

type RateLimitFn = (input: { key: string }) => Promise<{ success: boolean }>;

const runtime = vi.hoisted(() => ({
  env: {} as {
    FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED?: string;
    FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE?: string;
    FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT?: { limit: RateLimitFn };
    FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT?: { limit: RateLimitFn };
    FIRST_PARTY_INGEST_RATE_LIMIT?: { limit: RateLimitFn };
  },
}));

vi.mock("cloudflare:workers", () => runtime);

const mocks = vi.hoisted(() => ({
  getActiveSourceForIngest: vi.fn(),
  decrypt: vi.fn(),
  saveSnapshot: vi.fn(),
}));

vi.mock("./FirstPartySignalsRepository", () => ({
  FirstPartySignalsRepository: {
    getActiveSourceForIngest: mocks.getActiveSourceForIngest,
  },
}));
vi.mock("./FirstPartyCredentialVault", () => ({
  FirstPartyCredentialVault: { decrypt: mocks.decrypt },
}));
vi.mock("./FirstPartySignalsService", () => ({
  FirstPartyBatchConflictError: class extends Error {},
  FirstPartyBatchInProgressError: class extends Error {},
  FirstPartySignalsService: { saveSnapshot: mocks.saveSnapshot },
}));

const sourceId = "2d7b09d4-884c-4b99-a2ca-56fd514fb710";
const secret = "test-secret";
const rateLimitScope = "open-seo-test-stage";
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

async function signedRequest() {
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  const timestamp = String(Date.now());
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
  const signature = bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, message)),
  );
  return new Request("https://app.example.com/api/site-signals/v1/aggregates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenSEO-Source": sourceId,
      "X-OpenSEO-Timestamp": timestamp,
      "X-OpenSEO-Signature": signature,
    },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED;
  delete runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE;
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
});

describe("first-party aggregate edge rate limits", () => {
  it("scopes the authenticated source key by trusted Worker stage", async () => {
    const authenticatedLimit = vi.fn().mockResolvedValue({ success: false });
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE = rateLimitScope;
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT = { limit: authenticatedLimit };

    const response = await handleFirstPartyAggregateRequest(
      await signedRequest(),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(authenticatedLimit).toHaveBeenCalledWith({
      key: `${rateLimitScope}:${sourceId}`,
    });
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("scopes coarse keys and bounds random UUIDs before body or secret work", async () => {
    const globalLimit = vi
      .fn<RateLimitFn>()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: false });
    const claimedLimit = vi.fn<RateLimitFn>().mockResolvedValue({
      success: true,
    });
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE = rateLimitScope;
    runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = { limit: globalLimit };
    runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = {
      limit: claimedLimit,
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
    expect(globalLimit.mock.calls.map(([input]) => input.key)).toEqual(
      Array.from({ length: 6 }, () => `${rateLimitScope}:aggregate-receiver`),
    );
    const claimedKeys = claimedLimit.mock.calls.map(([input]) => input.key);
    expect(new Set(claimedKeys).size).toBe(2);
    expect(
      claimedKeys.every((key) =>
        new RegExp(`^${rateLimitScope}:[0-9a-f-]{36}$`).test(key),
      ),
    ).toBe(true);
    expect(bodyPulls).toBe(0);
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });

  it.each(["binding", "scope"])(
    "fails closed before body or database work when an edge %s is missing",
    async (missing) => {
      const limit = vi.fn().mockResolvedValue({ success: true });
      runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
      runtime.env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT = { limit };
      if (missing === "binding") {
        runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE = rateLimitScope;
      } else {
        runtime.env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT = { limit };
        runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT = { limit };
      }

      let bodyPulls = 0;
      const response = await handleFirstPartyAggregateRequest(
        new Request("https://app.example.com/api/site-signals/v1/aggregates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenSEO-Source": sourceId,
          },
          body: new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                bodyPulls += 1;
                controller.close();
              },
            },
            { highWaterMark: 0 },
          ),
          duplex: "half",
        } as RequestInit & { duplex: "half" }),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(limit).not.toHaveBeenCalled();
      expect(bodyPulls).toBe(0);
      expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
      expect(mocks.decrypt).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the coarse edge limiter is unavailable", async () => {
    runtime.env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED = "true";
    runtime.env.FIRST_PARTY_INGEST_RATE_LIMIT_SCOPE = rateLimitScope;
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
      await signedRequest(),
    );

    expect(response.status).toBe(503);
    expect(mocks.getActiveSourceForIngest).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
});
