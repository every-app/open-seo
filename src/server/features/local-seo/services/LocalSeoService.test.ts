import { readFileSync } from "node:fs";
import type { Client, InValue } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LocalSeoService } from "./LocalSeoService";
import {
  finalizeLocalCheck,
  prepareLocalCheck,
  searchLocalPoints,
} from "./localSeoCollection";
import { LocalSeoRepository as repo } from "../repositories/LocalSeoRepository";
import {
  LocalPointStatus,
  LocalScanStatus,
  localPointLabel,
} from "@/shared/local-seo";

const mocks = vi.hoisted(() => ({
  client: null as Client | null,
  database: null as LibSQLDatabase | null,
  createWorkflow: vi.fn(),
  workflowStatus: vi.fn(),
  search: vi.fn(),
  hosted: vi.fn(),
  credits: vi.fn(),
}));

vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  mocks.client = createClient({ url: "file::memory:" });
  mocks.database = drizzle(mocks.client);
  return { db: mocks.database };
});
vi.mock("@/db/runBatch", () => ({
  runBatch: async (
    build: (
      tx: Pick<LibSQLDatabase, "insert" | "update" | "delete">,
    ) => { toSQL: () => { sql: string; params: InValue[] } }[],
  ) => {
    if (!mocks.database || !mocks.client)
      throw new Error("Database not initialized");
    await mocks.client.batch(
      build(mocks.database).map((query) => {
        const { sql, params } = query.toSQL();
        return { sql, args: params };
      }),
      "write",
    );
  },
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    LOCAL_RANK_WORKFLOW: {
      create: mocks.createWorkflow,
      get: async () => ({ status: mocks.workflowStatus }),
    },
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { localBatch: mocks.search } }),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.hosted,
}));
vi.mock("@/server/billing/subscription", () => ({
  getOrCreateOrganizationCustomer: async (customer: {
    organizationId: string;
  }) => ({ id: customer.organizationId }),
  getUsageCreditsRemaining: mocks.credits,
}));

const customer = {
  projectId: "project-a",
  organizationId: "org-a",
  userId: "user-a",
  userEmail: "test@example.com",
};
const business = {
  title: "Branch Books",
  address: "Portland",
  cid: "own-listing",
  placeId: null,
  latitude: 45.52,
  longitude: -122.68,
};
const client = mocks.client;
if (!client) throw new Error("Database not initialized");

beforeAll(async () => {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, archived_at TEXT);
    ${readFileSync("drizzle/sqlite/0065_reflective_wrecker.sql", "utf8")}
  `);
});
afterAll(() => client.close());
beforeEach(async () => {
  mocks.createWorkflow.mockResolvedValue({ id: "workflow" });
  mocks.workflowStatus.mockResolvedValue({ status: "running" });
  mocks.search.mockImplementation(async (searches: unknown[]) =>
    searches.map(() => ({ status: "fulfilled", value: [] })),
  );
  mocks.hosted.mockResolvedValue(false);
  mocks.credits.mockResolvedValue({ monthlyRemaining: 0, topupRemaining: 0 });
  await client.executeMultiple(
    "DELETE FROM projects; INSERT INTO projects VALUES ('project-a', 'org-a', NULL), ('project-b', 'org-b', NULL);",
  );
});

async function trackerAndInput(gridSize: 3 | 5 = 3, keywords = ["bookstore"]) {
  const tracker = await LocalSeoService.createTracker(
    {
      projectId: customer.projectId,
      business,
      keywords,
      gridSize,
      spacingKm: 2,
    },
    "en",
  );
  const state = await LocalSeoService.getTracker(
    customer.projectId,
    tracker.id,
  );
  return {
    tracker,
    input: {
      projectId: customer.projectId,
      trackerId: tracker.id,
      requestId: crypto.randomUUID(),
      maxCostCredits: state.estimate.costCredits,
    },
  };
}

async function startedScan() {
  const { input } = await trackerAndInput();
  const check = await LocalSeoService.startCheck(input, customer);
  const [scan] = await repo.getScansForCheck(customer.projectId, check.id);
  return scan;
}

async function searchedScan() {
  const scan = await startedScan();
  const [plan] = await prepareLocalCheck(customer.projectId, scan.checkId);
  await searchLocalPoints(plan, plan.points, customer);
  return scan;
}

describe("saved local SEO scans", () => {
  it.each([3, 5] as const)(
    "checks all keywords once for grid width %s across repeated requests",
    async (gridSize) => {
      const { input } = await trackerAndInput(gridSize, [
        "bookstore",
        "used books",
      ]);
      const first = await LocalSeoService.startCheck(input, customer);
      const same = await LocalSeoService.startCheck(input, customer);
      const otherClick = await LocalSeoService.startCheck(
        { ...input, requestId: crypto.randomUUID() },
        customer,
      );
      expect([same.id, otherClick.id]).toEqual([first.id, first.id]);
      expect(mocks.createWorkflow).toHaveBeenCalledTimes(1);
      const state = await LocalSeoService.getTracker(
        customer.projectId,
        input.trackerId,
      );
      expect(state.scans.map((scan) => scan.keywordId)).toEqual(
        expect.arrayContaining(state.keywords.map((keyword) => keyword.id)),
      );
      expect(state.scans).toHaveLength(2);
      const saved = await LocalSeoService.getScan(
        customer.projectId,
        state.scans[0].id,
      );
      expect(saved.points).toHaveLength(gridSize ** 2);
      expect(saved.points[Math.floor(saved.points.length / 2)]).toMatchObject({
        latitude: business.latitude,
        longitude: business.longitude,
        status: LocalPointStatus.Pending,
      });
    },
  );

  it("prevents another project from reading or starting a tracker or scan", async () => {
    const { input } = await trackerAndInput();
    const check = await LocalSeoService.startCheck(input, customer);
    const [scan] = await repo.getScansForCheck(customer.projectId, check.id);
    await expect(
      LocalSeoService.getTracker("project-b", input.trackerId),
    ).rejects.toThrow("not found in this project");
    await expect(LocalSeoService.getScan("project-b", scan.id)).rejects.toThrow(
      "not found in this project",
    );
    await expect(
      LocalSeoService.startCheck(
        { ...input, projectId: "project-b" },
        { ...customer, projectId: "project-b", organizationId: "org-b" },
      ),
    ).rejects.toThrow("not found in this project");
    expect(await LocalSeoService.listTrackers("project-b")).toEqual([]);
  });

  it("rejects a lower credit approval before submitting paid searches", async () => {
    const { input } = await trackerAndInput(3, ["bookstore", "used books"]);
    const belowTotal = input.maxCostCredits - 1;
    await expect(
      LocalSeoService.startCheck(
        { ...input, maxCostCredits: belowTotal },
        customer,
      ),
    ).rejects.toThrow("estimate changed");
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it("matches the exact listing and stores competitors once", async () => {
    const items = [
      { title: business.title, cid: "other-branch", rank_absolute: 1 },
      {
        title: business.title,
        cid: business.cid,
        rank_absolute: 7,
        rating: { value: 4.8, votes_count: 50 },
      },
      { title: business.title, cid: business.cid, rank_absolute: 8 },
    ];
    mocks.search.mockImplementation(async (searches: unknown[]) =>
      searches.map(() => ({ status: "fulfilled", value: items })),
    );
    const scan = await searchedScan();
    await finalizeLocalCheck(customer.projectId, scan.checkId);
    const saved = await LocalSeoService.getScan(customer.projectId, scan.id);
    expect(saved.scan.status).toBe(LocalScanStatus.Completed);
    const state = await LocalSeoService.getTracker(
      customer.projectId,
      scan.trackerId,
    );
    expect(state.scans.find((row) => row.id === scan.id)).toMatchObject({
      summary: { completed: 9, found: 9, averageRank: 7, top3Percent: 0 },
    });
    const point = saved.points[0];
    expect(
      saved.results.filter((result) => result.pointId === point.id),
    ).toMatchObject([
      { cid: "other-branch", rank: 1 },
      { cid: business.cid, rank: 7, rating: 4.8, reviews: 50 },
    ]);
    expect(
      (
        await client.execute(
          "SELECT count(*) AS count FROM local_rank_businesses",
        )
      ).rows[0]?.count,
    ).toBe(2);
  });

  it("distinguishes sparse results from failed searches and excludes failures from coverage", async () => {
    const values = [
      [
        {
          title: business.title,
          cid: business.cid,
          rank_absolute: null,
          rank_group: 2,
        },
      ],
      // An unusable result fails only its own point.
      [{ cid: "untitled" }],
    ];
    mocks.search.mockImplementation(async (searches: unknown[]) =>
      searches.map((_, index) =>
        index === 0
          ? { status: "rejected", reason: new Error("Provider failure") }
          : { status: "fulfilled", value: values[index - 1] ?? [] },
      ),
    );
    const scan = await searchedScan();
    await finalizeLocalCheck(customer.projectId, scan.checkId);
    const saved = await LocalSeoService.getScan(customer.projectId, scan.id);
    expect(saved.scan.status).toBe(LocalScanStatus.Partial);
    const state = await LocalSeoService.getTracker(
      customer.projectId,
      scan.trackerId,
    );
    expect(state.scans.find((row) => row.id === scan.id)).toMatchObject({
      summary: { completed: 7, found: 1, averageRank: 2, top3Percent: 14 },
    });
    expect(saved.points.slice(0, 4).map(localPointLabel)).toEqual([
      "Search failed",
      "#2",
      "Search failed",
      "Not found · 0 listings returned",
    ]);
  });

  it("rejects insufficient hosted credits before queuing a scan", async () => {
    const { input } = await trackerAndInput();
    mocks.hosted.mockResolvedValue(true);
    await expect(LocalSeoService.startCheck(input, customer)).rejects.toThrow(
      "INSUFFICIENT_CREDITS",
    );
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it("marks unfinished points as failed when the workflow stops", async () => {
    const scan = await startedScan();
    mocks.workflowStatus.mockResolvedValue({ status: "errored" });
    const saved = await LocalSeoService.getScan(customer.projectId, scan.id);
    expect(saved.scan.status).toBe(LocalScanStatus.Failed);
    expect(
      saved.points.every((point) => point.status === LocalPointStatus.Failed),
    ).toBe(true);
  });
});
