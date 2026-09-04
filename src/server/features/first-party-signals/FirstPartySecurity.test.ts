import { describe, expect, it } from "vitest";
import { firstPartyAggregateSnapshotSchema } from "@/shared/first-party-signals";
import { bytesToHex } from "./encoding";
import {
  hasSensitivePathIdentifier,
  normalizeAllowedPaths,
  normalizePublicLandingPath,
} from "./FirstPartyPathPolicy";
import {
  parseSignatureTimestamp,
  verifyFirstPartySignature,
} from "./FirstPartySignature";

async function sign(secret: string, timestamp: string, body: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);
  return bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, message)),
  );
}

describe("first-party aggregate signatures", () => {
  it("verifies HMAC-SHA256 over timestamp and the exact raw bytes", async () => {
    const secret = "secret";
    const timestamp = "1788500000000";
    const rawBody = new TextEncoder().encode('{"value":1}');
    const signature = await sign(secret, timestamp, rawBody);

    await expect(
      verifyFirstPartySignature({ secret, timestamp, rawBody, signature }),
    ).resolves.toBe(true);
    await expect(
      verifyFirstPartySignature({
        secret,
        timestamp,
        rawBody: new TextEncoder().encode('{ "value": 1 }'),
        signature,
      }),
    ).resolves.toBe(false);
  });

  it("accepts only 10 or 13 digit timestamps within five minutes", () => {
    const now = Date.UTC(2026, 8, 4, 12, 0, 0);
    expect(parseSignatureTimestamp(String(now), now)).toBe(String(now));
    expect(parseSignatureTimestamp(String(now / 1_000), now)).toBe(
      String(now / 1_000),
    );
    expect(parseSignatureTimestamp(String(now - 300_001), now)).toBeNull();
    expect(parseSignatureTimestamp("not-a-timestamp", now)).toBeNull();
  });
});

describe("first-party landing path policy", () => {
  it("requires an exact allowlisted public path", () => {
    const allowedPaths = normalizeAllowedPaths(["/", "/pricing"]);
    expect(
      normalizePublicLandingPath({
        value: "/pricing",
        projectDomain: "www.example.com",
        allowedPaths,
      }),
    ).toBe("/pricing");
    expect(
      normalizePublicLandingPath({
        value: "/pr%69cing",
        projectDomain: "www.example.com",
        allowedPaths,
      }),
    ).toBe("/pricing");
    expect(
      normalizePublicLandingPath({
        value: "/pricing/team",
        projectDomain: "www.example.com",
        allowedPaths,
      }),
    ).toBeNull();
    expect(
      normalizePublicLandingPath({
        value: "/pricing?email=person@example.com",
        projectDomain: "www.example.com",
        allowedPaths,
      }),
    ).toBeNull();
  });

  it("fails closed on private and identifier-shaped paths", () => {
    expect(() => normalizeAllowedPaths(["/checkout"])).toThrow();
    expect(() => normalizeAllowedPaths(["/orders/12345678"])).toThrow();
    expect(() => normalizeAllowedPaths(["/consulta/AB123CD"])).toThrow();
    expect(() => normalizeAllowedPaths(["/profiles/user_abcd1234"])).toThrow();
    expect(() =>
      normalizeAllowedPaths(["/profiles/clx9ag2z50000qwerty123456"]),
    ).toThrow();
    expect(() =>
      normalizeAllowedPaths(["/people/6ba7b810-9dad-11d1-80b4-00c04fd430c8"]),
    ).toThrow();
    expect(hasSensitivePathIdentifier("/person%2540example.com")).toBe(true);
  });

  it("canonicalizes percent encoding before private-path and uniqueness checks", () => {
    for (const path of [
      "/%61dmin",
      "/%2561dmin",
      "/d%61shboard",
      "/profiles",
      "/orders",
      "/oauth/callback",
    ]) {
      expect(() => normalizeAllowedPaths([path])).toThrow();
    }
    expect(() => normalizeAllowedPaths(["/pricing", "/pr%69cing"])).toThrow();
  });

  it("rejects encoded separators and dot traversal at every decode depth", () => {
    for (const path of [
      "/public/%2Fadmin",
      "/public/%252fadmin",
      "/public/%5Cadmin",
      "/public/%255cadmin",
      "/public/%2e%2e/admin",
      "/public/%252e%252e/admin",
      "/public/../admin",
      "/public/%EF%BC%8Fadmin",
    ]) {
      expect(() => normalizeAllowedPaths([path])).toThrow();
    }
  });
});

describe("first-party aggregate payload", () => {
  const row = {
    landingPath: "/pricing",
    searchStarted: 10,
    searchCompleted: 8,
    searchNoResults: 1,
    registrationsCompleted: 3,
    checkoutStarted: 2,
    paymentsCompleted: 1,
  };

  it("accepts only the six nonnegative counters", () => {
    expect(
      firstPartyAggregateSnapshotSchema.safeParse({
        schemaVersion: 1,
        batchId: "f1a2ae17-b157-4bb9-b1a1-960ce8d4c01d",
        snapshotDate: "2026-09-04",
        rows: [row],
      }).success,
    ).toBe(true);
    expect(
      firstPartyAggregateSnapshotSchema.safeParse({
        schemaVersion: 1,
        batchId: "user-or-order-derived-id",
        snapshotDate: "2026-09-04",
        rows: [row],
      }).success,
    ).toBe(false);
    for (const forbidden of [
      { userId: "user_1" },
      { email: "person@example.com" },
      { amount: 100 },
      { searchTerm: "private query" },
      { sessionId: "session_1" },
    ]) {
      expect(
        firstPartyAggregateSnapshotSchema.safeParse({
          schemaVersion: 1,
          batchId: "f1a2ae17-b157-4bb9-b1a1-960ce8d4c01d",
          snapshotDate: "2026-09-04",
          rows: [{ ...row, ...forbidden }],
        }).success,
      ).toBe(false);
    }
  });
});
