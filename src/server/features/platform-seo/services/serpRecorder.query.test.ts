import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as RecorderModule from "./serpRecorder";
import type * as ServiceModule from "./PlatformDiscoveryService";

// Real in-memory SQLite: recording is conflict-safe upserts and a latest-run
// join, which mocked builder chains can't verify.

const classifyPlatforms = vi.fn();
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
  waitUntil: (work: Promise<unknown>) => work,
}));
vi.mock("./platformClassifier", () => ({ classifyPlatforms }));
vi.mock("@/server/features/keywords/services/research/serpReads", () => ({
  readMergedSerps: vi.fn(),
}));

const passthrough = <T>(fn: () => Promise<T>) => fn();

let client: Client;
let recordSerpReads: typeof RecorderModule.recordSerpReads;
let PlatformDiscoveryService: typeof ServiceModule.PlatformDiscoveryService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the modules under test load after
  // these mocks — the sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: testDb, withPgClient: passthrough }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({
    pgDb: null,
    withPgClient: passthrough,
  }));

  const migration = readFileSync(
    new URL(
      "../../../../../drizzle/sqlite/0073_platform_discovery.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.executeMultiple(`
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    INSERT INTO organization VALUES ('org-a'), ('org-b');
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    ${migration.replaceAll("--> statement-breakpoint", "")}
  `);

  ({ recordSerpReads } = await import("./serpRecorder"));
  ({ PlatformDiscoveryService } = await import("./PlatformDiscoveryService"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  classifyPlatforms.mockResolvedValue(0);
  await client.executeMultiple(
    "DELETE FROM ps_serp_observations; DELETE FROM ps_platforms;",
  );
});

const organic = (rank: number, url: string, title: string) => ({
  type: "organic",
  rank_group: rank,
  domain: new URL(url).hostname,
  url,
  title,
});

const query = {
  keyword: "Parasite SEO Sites",
  locationCode: 2840,
  languageCode: "en",
};
const customer = {
  organizationId: "org-a",
  userId: "u",
  userEmail: "u@example.com",
  projectId: undefined,
};

const reads = [
  [
    organic(1, "https://jane.medium.com/post", "My Medium post"),
    organic(3, "https://www.example-agency.com/blog", "Agency blog"),
    organic(14, "https://www.reddit.com/r/seo/a", "Reddit thread"),
    organic(25, "https://deep.example.org/x", "Page three"),
  ],
  [
    organic(2, "https://www.example-agency.com/blog", "Agency blog"),
    organic(9, "https://late-only.example.net/", "Late read result"),
  ],
];

async function platforms(organizationId: string) {
  const result = await client.execute({
    sql: "SELECT domain, status, seen_count, best_position FROM ps_platforms WHERE organization_id = ? ORDER BY domain",
    args: [organizationId],
  });
  return result.rows.map((row) => ({ ...row }));
}

describe("recordSerpReads", () => {
  it("lists each platform once per run and sends only new unknown sites to the AI pass", async () => {
    // The first read alone, then a free replay of the same paid run that also
    // collects the late read: only the late read's new site is added.
    await recordSerpReads({
      customer,
      query,
      taskIds: ["t2", "t1"],
      reads: reads.slice(0, 1),
    });
    await recordSerpReads({ customer, query, taskIds: ["t1", "t2"], reads });
    await recordSerpReads({ customer, query, taskIds: ["t1", "t2"], reads });

    expect(await platforms("org-a")).toEqual([
      // Best position across reads; page 3 is left out.
      {
        domain: "example-agency.com",
        status: "pending",
        seen_count: 1,
        best_position: 2,
      },
      // Only in the late read, so only the replay could add it.
      {
        domain: "example.net",
        status: "pending",
        seen_count: 1,
        best_position: 9,
      },
      // Subdomains collapse into the platform, which joins as known.
      {
        domain: "medium.com",
        status: "parasite",
        seen_count: 1,
        best_position: 1,
      },
      {
        domain: "reddit.com",
        status: "parasite",
        seen_count: 1,
        best_position: 14,
      },
    ]);
    expect(await platforms("org-b")).toEqual([]);
    // The paid AI pass sees each new unknown site exactly once: the agency on
    // the first pass, the late-only site on the replay, nothing on the repeat.
    const sentToAi = classifyPlatforms.mock.calls.map(
      ([, options]) => (options as { ids: string[] }).ids.length,
    );
    expect(sentToAi).toEqual([1, 1]);
  });

  it("scores a keyword from its latest page of results", async () => {
    await recordSerpReads({ customer, query, taskIds: ["t1"], reads });

    const [opportunity] = await PlatformDiscoveryService.getOpportunities({
      organizationId: "org-a",
      keywords: ["parasite seo sites"],
      locationCode: 2840,
      languageCode: "en",
    });
    expect(opportunity).toMatchObject({
      keyword: "parasite seo sites",
      page1: 1,
      page2: 1,
      sawPage2: true,
      label: "possible",
    });
  });
});
