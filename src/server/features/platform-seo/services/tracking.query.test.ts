import type { Client } from "@libsql/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as TrackingModule from "./TrackingService";
import { createTopicHubDb, resetTopicHubDb } from "./topicHubTestDb";

// Real in-memory SQLite: a check posts its reads, collection fills in the
// results from the reads and the project's AI sources, and the pipeline counts
// them. DataForSEO is mocked; each task id is the query it read.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
const dataforseo = vi.hoisted(() => ({
  rankCheckTaskPost:
    vi.fn<
      (input: {
        tasks: { keyword: string; keywordId: string; device: string }[];
        depth: number;
      }) => Promise<unknown>
    >(),
  fetchSerpTaskResult: vi.fn<(taskId: string) => Promise<unknown>>(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    serp: { rankCheckTaskPost: dataforseo.rankCheckTaskPost },
  }),
  fetchSerpTaskResult: dataforseo.fetchSerpTaskResult,
}));

const passthrough = <T>(fn: () => Promise<T>) => fn();
const customer = {
  organizationId: "org-a",
  userEmail: "a@example.com",
  userId: "u-a",
};
const scope = {
  projectId: "p-a",
  organizationId: "org-a",
  locationCode: 2840,
  languageCode: "en",
};
const organic = (url: string, rank_group: number) => ({
  type: "organic",
  url,
  rank_group,
});

let client: Client;
let TrackingService: typeof TrackingModule.TrackingService;

beforeAll(async () => {
  const hub = await createTopicHubDb();
  client = hub.client;
  // The test database only exists at runtime, so the service loads after
  // these mocks — the sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: hub.db, withPgClient: passthrough }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: hub.db }));
  vi.doMock("@/db/pg/client", () => ({
    pgDb: null,
    withPgClient: passthrough,
  }));
  ({ TrackingService } = await import("./TrackingService"));
});

afterAll(() => {
  client.close();
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  dataforseo.rankCheckTaskPost.mockImplementation(({ tasks }) =>
    Promise.resolve(tasks.map((task) => ({ ...task, taskId: task.keyword }))),
  );
  dataforseo.fetchSerpTaskResult.mockImplementation((taskId) =>
    Promise.resolve({
      status: "completed",
      items:
        taskId === "parasite seo"
          ? [organic("https://dev.to/rob/p-1", 4)]
          : taskId === "site:dev.to/rob/p-1"
            ? [organic("https://dev.to/rob/p-1", 1)]
            : [],
    }),
  );
  await resetTopicHubDb(client);
  // Two published Dev.to copies; only the first topic has a target keyword,
  // and one of the project's AI answers cites it.
  await client.executeMultiple(`
    DELETE FROM ai_sources; DELETE FROM ai_observations; DELETE FROM ai_runs;
    INSERT INTO ps_topics (id, project_id, title, status, location_code, language_code, primary_keyword) VALUES
      ('t1', 'p-a', 'Parasite SEO', 'published', 2840, 'en', 'parasite seo'),
      ('t2', 'p-a', 'No keyword', 'published', 2840, 'en', NULL);
    INSERT INTO ps_articles (id, topic_id, canonical_title, body_markdown, status) VALUES
      ('a1', 't1', 'T1', 'Body', 'ready'), ('a2', 't2', 'T2', 'Body', 'ready');
    INSERT INTO ps_channels (id, organization_id, type, display_name, token_ciphertext)
      VALUES ('ch', 'org-a', 'devto', 'Dev.to', 'sealed');
    INSERT INTO ps_syndications (id, article_id, channel_id, platform_title, platform_body, status, live_url) VALUES
      ('s1', 'a1', 'ch', 'T1', 'B', 'published', 'https://dev.to/rob/p-1'),
      ('s2', 'a2', 'ch', 'T2', 'B', 'published', 'https://dev.to/rob/p-2');
    INSERT INTO ai_runs VALUES ('r1', 'p-a');
    INSERT INTO ai_observations VALUES ('o1', 'r1');
    INSERT INTO ai_sources VALUES ('src1', 'o1', 'https://www.dev.to/rob/p-1/', 'dev.to');
  `);
});

// Collection leaves a check alone for its first two minutes.
async function collectAfter(ms = 3 * 60 * 1000) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + ms);
  return TrackingService.collect(scope);
}
const HOUR = 60 * 60 * 1000;

describe("TrackingService", () => {
  it("checks rank and indexing, then fills each copy's results", async () => {
    expect(
      await TrackingService.startChecks({ scope, customer }),
    ).toMatchObject({ started: 2 });
    const posts = dataforseo.rankCheckTaskPost.mock.calls.map(([input]) => ({
      depth: input.depth,
      keywords: input.tasks.map((task) => task.keyword),
    }));
    expect(posts).toEqual([
      { depth: 30, keywords: ["parasite seo"] },
      { depth: 10, keywords: ["site:dev.to/rob/p-1", "site:dev.to/rob/p-2"] },
    ]);

    expect(await collectAfter()).toEqual({ pending: 0 });
    const pipeline = await TrackingService.getPipeline(scope);
    const byId = new Map(
      pipeline.copies.map((copy) => [copy.syndicationId, copy.lastCheck]),
    );
    expect(byId.get("s1")).toMatchObject({
      keyword: "parasite seo",
      indexed: true,
      ranked: true,
      googlePosition: 4,
      aiCited: true,
    });
    expect(byId.get("s2")).toMatchObject({
      keyword: null,
      indexed: false,
      ranked: null,
      googlePosition: null,
      aiCited: false,
    });
    expect(pipeline.stages).toMatchObject({
      // The pull kept one relevant keyword.
      keywords: 1,
      published: 2,
      checked: 2,
      indexed: 1,
      ranking: 1,
      pageOne: 1,
      cited: 1,
    });
  });

  it("doesn't buy a check again while one is running", async () => {
    await TrackingService.startChecks({ scope, customer });
    dataforseo.rankCheckTaskPost.mockClear();
    expect(await TrackingService.startChecks({ scope, customer })).toEqual({
      started: 0,
      alreadyRunning: 2,
      failed: 0,
    });
    expect(dataforseo.rankCheckTaskPost).not.toHaveBeenCalled();
  });

  it("keeps paid results waiting until the page next opens", async () => {
    await TrackingService.startChecks({ scope, customer });
    // Nobody opened the page for hours; the finished reads are still used.
    expect(await collectAfter(7 * HOUR)).toEqual({ pending: 0 });
    const { stages } = await TrackingService.getPipeline(scope);
    expect(stages.checked).toBe(2);
  });

  it("gives up only on reads still queued after days", async () => {
    dataforseo.fetchSerpTaskResult.mockResolvedValue({ status: "pending" });
    await TrackingService.startChecks({ scope, customer });
    expect(await collectAfter(7 * HOUR)).toEqual({ pending: 2 });
    expect(await collectAfter(4 * 24 * HOUR)).toEqual({ pending: 0 });
    const { copies } = await TrackingService.getPipeline(scope);
    expect(copies.every((copy) => copy.lastCheckFailed)).toBe(true);
  });

  it("calls a failed rank read unknown, not 'not ranking'", async () => {
    dataforseo.fetchSerpTaskResult.mockImplementation((taskId) =>
      Promise.resolve(
        taskId === "parasite seo"
          ? { status: "failed", message: "boom" }
          : { status: "completed", items: [] },
      ),
    );
    await TrackingService.startChecks({
      scope,
      customer,
      syndicationIds: ["s1"],
    });
    await collectAfter();
    const { copies, stages } = await TrackingService.getPipeline(scope);
    expect(
      copies.find((c) => c.syndicationId === "s1")?.lastCheck,
    ).toMatchObject({
      ranked: null,
      googlePosition: null,
    });
    expect(stages.ranking).toBe(0);
  });

  it("only checks copies in the caller's organization", async () => {
    expect(
      await TrackingService.startChecks({
        scope: { ...scope, organizationId: "org-b" },
        customer,
      }),
    ).toEqual({ started: 0, alreadyRunning: 0, failed: 0 });
    expect(dataforseo.rankCheckTaskPost).not.toHaveBeenCalled();
  });
});
