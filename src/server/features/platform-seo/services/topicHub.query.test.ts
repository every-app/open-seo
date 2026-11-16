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
import type * as ArticleModule from "./ArticleService";
import type * as ServiceModule from "./TopicService";

// Real in-memory SQLite: topics snapshot cluster keywords and join metrics on
// their own market, and articles move their topic's status, which mocked
// builder chains can't verify.

const generateStructured = vi.fn();
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("./llm", () => ({
  generateStructured,
  withStepAdmission: (_customer: unknown, work: () => Promise<unknown>) =>
    work(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getWorkersEnv: () => Promise.resolve({}),
}));
vi.mock("@/server/lib/openrouter", () => ({
  getOpenRouterAccess: () => ({}),
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: { listSections: () => Promise.resolve([]) },
  }),
);

const passthrough = <T>(fn: () => Promise<T>) => fn();
const customer = {
  organizationId: "org-a",
  userEmail: "a@example.com",
  userId: "u-a",
};

let client: Client;
let TopicService: typeof ServiceModule.TopicService;
let ArticleService: typeof ArticleModule.ArticleService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test loads after these
  // mocks — the sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: testDb, withPgClient: passthrough }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({
    pgDb: null,
    withPgClient: passthrough,
  }));

  const migration = [
    "0072_platform_seo_phase1.sql",
    "0075_platform_topics.sql",
    "0076_platform_articles.sql",
  ]
    .map((file) =>
      readFileSync(
        new URL(`../../../../../drizzle/sqlite/${file}`, import.meta.url),
        "utf8",
      ),
    )
    .join(";\n");
  await client.executeMultiple(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, location_code INTEGER, language_code TEXT);
    INSERT INTO projects VALUES ('p-a', 2840, 'en'), ('p-b', 2840, 'en');
    CREATE TABLE keyword_metrics (
      id INTEGER PRIMARY KEY, project_id TEXT, keyword TEXT, location_code INTEGER,
      language_code TEXT, search_volume INTEGER, keyword_difficulty INTEGER
    );
    ${migration.replaceAll("--> statement-breakpoint", "")}
  `);

  ({ TopicService } = await import("./TopicService"));
  ({ ArticleService } = await import("./ArticleService"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  generateStructured.mockResolvedValue({
    primaryKeywordIndex: 99,
    angle: "For first-timers",
    questionIndices: [0, 0, 42],
    outline: [{ heading: "What it is", notes: "Define it." }],
  });
  await client.executeMultiple(`
    DELETE FROM ps_topics; DELETE FROM ps_keyword_pulls; DELETE FROM keyword_metrics;
    INSERT INTO ps_keyword_pulls (id, project_id, seed, country, language, location_code, language_code, source, stage, raw_count)
      VALUES ('pull', 'p-a', 'parasite seo', 'GB', 'en', 2826, 'en', 'answersocrates', 'clustered', 3);
    INSERT INTO ps_pulled_keywords (id, pull_id, keyword, "group", relevant) VALUES
      ('k1', 'pull', 'what is parasite seo', 'question', 1),
      ('k2', 'pull', 'is parasite seo the film', 'question', 0);
    INSERT INTO ps_clusters (id, project_id, pull_id, name, dominant_intent, funnel_stage, position)
      VALUES ('c1', 'p-a', 'pull', 'Basics', 'informational', 'tofu', 0);
    INSERT INTO ps_cluster_keywords (id, cluster_id, keyword, intent, funnel_stage) VALUES
      ('ck1', 'c1', 'parasite seo', 'informational', 'tofu'),
      ('ck2', 'c1', 'parasite seo sites', 'informational', 'tofu');
    INSERT INTO keyword_metrics (project_id, keyword, location_code, language_code, search_volume) VALUES
      ('p-a', 'parasite seo', 2826, 'en', 900),
      ('p-a', 'parasite seo', 2840, 'en', 5);
  `);
});

describe("TopicService", () => {
  it("keeps a topic's keywords and market after its cluster is replaced, and reuses it on a second click", async () => {
    const first = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    expect(first.created).toBe(true);
    expect(
      await TopicService.createTopicFromCluster({
        projectId: "p-a",
        clusterId: "c1",
      }),
    ).toEqual({ topicId: first.topicId, created: false });

    // Re-clustering the pull deletes its clusters.
    await client.execute("DELETE FROM ps_clusters");
    const topic = await TopicService.getTopic("p-a", first.topicId);
    expect(topic.keywords).toEqual([
      { keyword: "parasite seo", searchVolume: 900, keywordDifficulty: null },
      {
        keyword: "parasite seo sites",
        searchVolume: null,
        keywordDifficulty: null,
      },
    ]);
  });

  it("builds a brief from real, relevant questions and only moves an idea forward", async () => {
    const { topicId } = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    await TopicService.generateBrief({ projectId: "p-a", topicId, customer });

    const topic = await TopicService.getTopic("p-a", topicId);
    expect(topic).toMatchObject({
      status: "drafting",
      // An out-of-range pick falls back to the top keyword.
      primaryKeyword: "parasite seo",
      angle: "For first-timers",
      questions: ["what is parasite seo"],
      sections: [{ heading: "What it is", notes: "Define it." }],
    });

    await TopicService.updateTopic({
      projectId: "p-a",
      topicId,
      status: "published",
    });
    await TopicService.generateBrief({ projectId: "p-a", topicId, customer });
    expect((await TopicService.getTopic("p-a", topicId)).status).toBe(
      "published",
    );
  });

  it("keeps a topic inside its project", async () => {
    const { topicId } = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    await expect(TopicService.getTopic("p-b", topicId)).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(
      TopicService.updateTopic({ projectId: "p-b", topicId, title: "Mine" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      TopicService.generateBrief({ projectId: "p-b", topicId, customer }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(TopicService.deleteTopic("p-b", topicId)).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(
      TopicService.createTopicFromCluster({
        projectId: "p-b",
        clusterId: "c1",
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("only targets one of the topic's own keywords", async () => {
    const { topicId } = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    await expect(
      TopicService.updateTopic({
        projectId: "p-a",
        topicId,
        primaryKeyword: "something else",
      }),
    ).rejects.toThrow("primary keyword");
  });
});

describe("ArticleService", () => {
  async function topicWithArticle(body: string) {
    const { topicId } = await TopicService.createTopicFromCluster({
      projectId: "p-a",
      clusterId: "c1",
    });
    await ArticleService.saveArticle({
      projectId: "p-a",
      topicId,
      title: "Parasite SEO",
      body,
    });
    return topicId;
  }
  const topicStatus = async (topicId: string) =>
    (await TopicService.getTopic("p-a", topicId)).status;

  it("keeps article and topic status in step, but never pulls a published topic back", async () => {
    const topicId = await topicWithArticle("Some text.");
    await ArticleService.setArticleStatus({
      projectId: "p-a",
      topicId,
      status: "ready",
    });
    expect(await topicStatus(topicId)).toBe("ready");
    await ArticleService.setArticleStatus({
      projectId: "p-a",
      topicId,
      status: "draft",
    });
    expect(await topicStatus(topicId)).toBe("drafting");

    // Moving the topic on the board moves the article with it.
    await TopicService.updateTopic({
      projectId: "p-a",
      topicId,
      status: "ready",
    });
    const { article } = await ArticleService.getEditor("p-a", topicId);
    expect(article?.status).toBe("ready");

    await TopicService.updateTopic({
      projectId: "p-a",
      topicId,
      status: "published",
    });
    await ArticleService.setArticleStatus({
      projectId: "p-a",
      topicId,
      status: "draft",
    });
    expect(await topicStatus(topicId)).toBe("published");
  });

  it("keeps the saved article when a humanized rewrite comes back cut short", async () => {
    const body = "word ".repeat(100).trim();
    const topicId = await topicWithArticle(body);
    generateStructured.mockResolvedValue({ markdown: "word ".repeat(40) });

    const result = await ArticleService.humanizeArticle({
      projectId: "p-a",
      topicId,
      title: "Parasite SEO",
      body,
      customer,
    });
    expect(result).toEqual({ outcome: "too_short" });
    const { article } = await ArticleService.getEditor("p-a", topicId);
    expect(article?.bodyMarkdown).toBe(body);
  });

  it("keeps an article inside its topic's project", async () => {
    const topicId = await topicWithArticle("Mine.");
    await expect(ArticleService.getEditor("p-b", topicId)).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(
      ArticleService.saveArticle({
        projectId: "p-b",
        topicId,
        title: "Theirs",
        body: "Theirs.",
      }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      ArticleService.humanizeArticle({
        projectId: "p-b",
        topicId,
        title: "Theirs",
        body: "Theirs.",
        customer,
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(generateStructured).not.toHaveBeenCalled();
    const { article } = await ArticleService.getEditor("p-a", topicId);
    expect(article?.bodyMarkdown).toBe("Mine.");
  });
});
