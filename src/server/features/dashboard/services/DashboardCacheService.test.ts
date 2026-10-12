import { DashboardFirstAuditService } from "./DashboardFirstAuditService";
import { AppError } from "@/server/lib/errors";
import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as R2Cache from "@/server/lib/r2-cache";
import { DashboardCacheService } from "./DashboardCacheService";

// Exercise the actual claim SQL: mocked ORM chains cannot prove that two
// worker instances cannot both win the same paid refresh.
const state = await vi.hoisted(async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`CREATE TABLE data_refresh_claims (
    key TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
    token TEXT NOT NULL, next_attempt_at INTEGER NOT NULL
  );`);
  return {
    client,
    db: drizzle(client),
    cache: new Map<string, unknown>(),
    startAudit: vi.fn(),
    latestAudit: vi.fn(),
  };
});
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: {
    resolveAuditLimitTier: async () => "free",
    startAudit: state.startAudit,
  },
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: { getLatestAuditForProject: state.latestAudit },
}));
vi.mock("@/db", () => ({ db: state.db }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/r2-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof R2Cache>()),
  getCached: async (key: string) => state.cache.get(key) ?? null,
  setCached: async (key: string, data: unknown) => {
    state.cache.set(key, data);
  },
}));

beforeEach(async () => {
  state.cache.clear();
  state.latestAudit.mockResolvedValue(null);
  state.startAudit.mockResolvedValue({ auditId: "audit" });
  await state.client.executeMultiple("DELETE FROM data_refresh_claims;");
});
afterEach(() => vi.useRealTimers());
afterAll(() => state.client.close());

function input(
  load = vi.fn(async () => ["real response"]),
  organizationId = "org-a",
) {
  return {
    namespace: "dashboard:test",
    organizationId,
    params: { domain: "example.com" },
    schema: z.array(z.string()),
    maxAgeMs: 86400_000,
    load,
  };
}

it("allows only one paid load for simultaneous cold visits and reuses the winner's result", async () => {
  let finish!: (value: string[]) => void;
  let started!: () => void;
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const load = vi.fn(() => {
    started();
    return new Promise<string[]>((resolve) => {
      finish = resolve;
    });
  });
  const first = DashboardCacheService.readThrough(input(load));
  await loading;
  await expect(DashboardCacheService.readThrough(input(load))).rejects.toThrow(
    "already running",
  );
  finish(["result"]);
  await first;
  expect((await DashboardCacheService.readThrough(input(load))).value).toEqual([
    "result",
  ]);
  expect(load).toHaveBeenCalledTimes(1);
});

it("caches empty results rather than billing again on every visit", async () => {
  const load = vi.fn(async () => [] as string[]);
  await DashboardCacheService.readThrough(input(load));
  expect((await DashboardCacheService.readThrough(input(load))).value).toEqual(
    [],
  );
  expect(load).toHaveBeenCalledTimes(1);
});

it("keeps stale results and backs off after a failed paid refresh", async () => {
  const load = vi.fn(async () => ["saved"]);
  await DashboardCacheService.readThrough(input(load));
  for (const [key, value] of state.cache) {
    const previous = z
      .object({ value: z.array(z.string()), fetchedAt: z.string() })
      .parse(value);
    state.cache.set(key, {
      ...previous,
      fetchedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    });
  }
  load.mockRejectedValue(new Error("provider unavailable"));
  const stale = await DashboardCacheService.readThrough(input(load));
  expect(stale).toMatchObject({ value: ["saved"], stale: true });
  await DashboardCacheService.readThrough(input(load));
  expect(load).toHaveBeenCalledTimes(2);
});

it("does not share cached provider data between organizations", async () => {
  const load = vi.fn(async () => ["a"]);
  await DashboardCacheService.readThrough(input(load));
  load.mockResolvedValue(["b"]);
  expect(
    (await DashboardCacheService.readThrough(input(load, "org-b"))).value,
  ).toEqual(["b"]);
  expect(load).toHaveBeenCalledTimes(2);
});

it("backs off cold failures without another provider charge", async () => {
  const load = vi.fn(async () => {
    throw new Error("out of credits");
  });
  await expect(DashboardCacheService.readThrough(input(load))).rejects.toThrow(
    "out of credits",
  );
  await expect(DashboardCacheService.readThrough(input(load))).rejects.toThrow(
    "temporarily paused",
  );
  expect(load).toHaveBeenCalledTimes(1);
});

const customer = {
  organizationId: "org",
  userId: "user",
  userEmail: "user@example.com",
};
it("starts only one rendered 50-page audit for simultaneous website saves", async () => {
  let finish!: () => void;
  let started!: () => void;
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  state.startAudit.mockImplementation(() => {
    started();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const first = DashboardFirstAuditService.start(
    "project",
    "example.com",
    customer,
  );
  await loading;
  expect(
    await DashboardFirstAuditService.start("project", "example.com", customer),
  ).toMatchObject({ status: "pending" });
  finish();
  expect(await first).toMatchObject({ status: "started" });
  await DashboardFirstAuditService.start("project", "example.com", customer);
  expect(state.startAudit).toHaveBeenCalledTimes(1);
  expect(state.startAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "project",
      maxPages: 50,
      renderJavaScript: true,
      billingCustomer: customer,
    }),
  );
});
it("returns a visible startup refusal and backs off instead of repeatedly attempting a billed scan", async () => {
  state.startAudit.mockRejectedValue(new AppError("INSUFFICIENT_CREDITS"));
  expect(
    await DashboardFirstAuditService.start("project", "example.com", customer),
  ).toMatchObject({ status: "unavailable", code: "INSUFFICIENT_CREDITS" });
  await DashboardFirstAuditService.start("project", "example.com", customer);
  expect(state.startAudit).toHaveBeenCalledTimes(1);
});
