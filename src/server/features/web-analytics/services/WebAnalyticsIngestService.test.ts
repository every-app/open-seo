import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestOp } from "../repositories/WebAnalyticsRepository";
import {
  belongsTo,
  clearSiteCache,
  ingestEvent,
  normalizePath,
} from "./WebAnalyticsIngestService";

const mocks = vi.hoisted(() => ({
  getById: vi.fn<() => Promise<unknown>>(),
  sessionExists: vi.fn<() => Promise<boolean>>(),
  applyIngestOps: vi.fn<(ops: IngestOp[]) => Promise<void>>(),
}));

vi.mock(
  "@/server/features/web-analytics/repositories/WebAnalyticsRepository",
  () => ({
    WebAnalyticsRepository: {
      getById: mocks.getById,
      sessionExists: mocks.sessionExists,
      applyIngestOps: mocks.applyIngestOps,
    },
  }),
);

const SITE = {
  id: "site1234567890abcd",
  projectId: "project-1",
  organizationId: "org-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  domain: "shipkit.dev",
};

const GEO = { country: "US", region: null, city: null };
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36";

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    w: SITE.id,
    t: "pageview",
    u: "https://shipkit.dev/pricing",
    vid: "11111111-1111-4111-8111-111111111111",
    sid: "22222222-2222-4222-8222-222222222222",
    sw: 1440,
    ...overrides,
  });
}

beforeEach(() => {
  clearSiteCache();
  mocks.getById.mockResolvedValue(SITE);
  mocks.sessionExists.mockResolvedValue(false);
  mocks.applyIngestOps.mockResolvedValue(undefined);
});

describe("belongsTo", () => {
  it("accepts subdomains only", () => {
    expect(belongsTo("app.shipkit.dev", "shipkit.dev")).toBe(true);
    expect(belongsTo("www.shipkit.dev", "shipkit.dev")).toBe(true);
    expect(belongsTo("evilshipkit.dev", "shipkit.dev")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("normalises paths", () => {
    expect(normalizePath("/pricing/")).toBe("/pricing");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/caf%C3%A9")).toBe("/café");
  });
});

describe("ingestEvent", () => {
  it("rejects oversized bodies", async () => {
    const outcome = await ingestEvent({
      rawBody: "x".repeat(8193),
      userAgent: UA,
      geo: GEO,
    });
    expect(outcome).toBe("payload_too_large");
    expect(mocks.applyIngestOps).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads", async () => {
    expect(
      await ingestEvent({ rawBody: "not json", userAgent: UA, geo: GEO }),
    ).toBe("invalid_payload");
    expect(
      await ingestEvent({
        rawBody: payload({ vid: "short" }),
        userAgent: UA,
        geo: GEO,
      }),
    ).toBe("invalid_payload");
    expect(
      await ingestEvent({
        rawBody: payload({ t: "identify" }),
        userAgent: UA,
        geo: GEO,
      }),
    ).toBe("invalid_payload");
    expect(mocks.applyIngestOps).not.toHaveBeenCalled();
  });

  it("silently drops bots", async () => {
    const outcome = await ingestEvent({
      rawBody: payload(),
      userAgent: "Mozilla/5.0 HeadlessChrome/120",
      geo: GEO,
    });
    expect(outcome).toBe("bot");
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.applyIngestOps).not.toHaveBeenCalled();
  });

  it("drops events for unknown sites", async () => {
    mocks.getById.mockResolvedValue(null);
    expect(
      await ingestEvent({ rawBody: payload(), userAgent: UA, geo: GEO }),
    ).toBe("unknown_site");
  });

  it("rejects URLs outside the site's domain", async () => {
    expect(
      await ingestEvent({
        rawBody: payload({ u: "https://evil.com/pricing" }),
        userAgent: UA,
        geo: GEO,
      }),
    ).toBe("foreign_domain");
    expect(mocks.applyIngestOps).not.toHaveBeenCalled();
  });

  it("creates a session with attribution on the first pageview", async () => {
    const outcome = await ingestEvent({
      rawBody: payload({
        u: "https://www.shipkit.dev/pricing?utm_source=x.com",
        r: "https://t.co/abc",
      }),
      userAgent: UA,
      geo: GEO,
      now: new Date("2026-10-23T12:00:00.000Z"),
    });
    expect(outcome).toBe("accepted");
    const ops = mocks.applyIngestOps.mock.calls[0]?.[0] ?? [];
    expect(ops.map((op) => op.kind)).toEqual([
      "insertSession",
      "markPageview",
      "insertEvent",
    ]);
    const session = ops.find(
      (op): op is Extract<IngestOp, { kind: "insertSession" }> =>
        op.kind === "insertSession",
    )?.session;
    expect(session).toMatchObject({
      source: "X",
      channel: "Organic Social",
      entryPage: "/pricing",
    });
  });

  it("skips session creation when the session already exists", async () => {
    mocks.sessionExists.mockResolvedValue(true);
    await ingestEvent({ rawBody: payload(), userAgent: UA, geo: GEO });
    const ops = mocks.applyIngestOps.mock.calls[0]?.[0] ?? [];
    expect(ops.map((op) => op.kind)).toEqual(["markPageview", "insertEvent"]);
  });

  it("records goals against the session counter", async () => {
    mocks.sessionExists.mockResolvedValue(true);
    await ingestEvent({
      rawBody: payload({ t: "goal", n: "signup_click" }),
      userAgent: UA,
      geo: GEO,
    });
    const ops = mocks.applyIngestOps.mock.calls[0]?.[0] ?? [];
    expect(ops.map((op) => op.kind)).toEqual(["markGoal", "insertEvent"]);
    const event = ops.find(
      (op): op is Extract<IngestOp, { kind: "insertEvent" }> =>
        op.kind === "insertEvent",
    )?.event;
    expect(event).toMatchObject({ type: "goal", name: "signup_click" });
  });

  it("ignores goals without a name", async () => {
    await ingestEvent({
      rawBody: payload({ t: "goal", n: "  " }),
      userAgent: UA,
      geo: GEO,
    });
    expect(mocks.applyIngestOps).not.toHaveBeenCalled();
  });

  it("clamps engaged-time pings", async () => {
    await ingestEvent({
      rawBody: payload({ t: "ping", d: 99_999_999 }),
      userAgent: UA,
      geo: GEO,
    });
    const ops = mocks.applyIngestOps.mock.calls[0]?.[0] ?? [];
    expect(ops[0]).toMatchObject({ kind: "addPing", durationMs: 600_000 });
  });

  it("caches the site row within its TTL", async () => {
    await ingestEvent({ rawBody: payload(), userAgent: UA, geo: GEO });
    await ingestEvent({ rawBody: payload(), userAgent: UA, geo: GEO });
    expect(mocks.getById).toHaveBeenCalledTimes(1);
    clearSiteCache();
    await ingestEvent({ rawBody: payload(), userAgent: UA, geo: GEO });
    expect(mocks.getById).toHaveBeenCalledTimes(2);
  });
});
