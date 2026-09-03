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
import type * as RepositoryModule from "./ContentExecutionRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let repository: typeof RepositoryModule.ContentExecutionRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      for (const statement of build(testDb)) await statement;
    },
  }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE saved_keywords (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      location_code INTEGER NOT NULL DEFAULT 2840,
      language_code TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE content_execution_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_url TEXT,
      status TEXT NOT NULL DEFAULT 'ready_to_assign',
      owner TEXT,
      due_date TEXT,
      jira_issue_key TEXT,
      jira_issue_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE content_execution_keyword_assignments (
      execution_item_id TEXT NOT NULL REFERENCES content_execution_items(id) ON DELETE CASCADE,
      saved_keyword_id TEXT NOT NULL REFERENCES saved_keywords(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(execution_item_id, saved_keyword_id),
      UNIQUE(saved_keyword_id)
    );
  `);

  ({ ContentExecutionRepository: repository } =
    await import("./ContentExecutionRepository"));
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM content_execution_keyword_assignments;
    DELETE FROM content_execution_items;
    DELETE FROM saved_keywords;
    DELETE FROM projects;
    INSERT INTO projects (id, organization_id, name) VALUES
      ('project_1', 'org_1', 'One'),
      ('project_2', 'org_2', 'Two');
    INSERT INTO saved_keywords (id, project_id, keyword) VALUES
      ('kw_primary', 'project_1', 'meta conversions api'),
      ('kw_variant', 'project_1', 'facebook conversion api'),
      ('kw_foreign', 'project_2', 'foreign keyword');
  `);
});

const createInput = {
  id: "item_1",
  projectId: "project_1",
  title: "Meta Conversions API solution page",
  targetUrl: "https://www.customerlabs.com/conversions-api/",
  status: "ready_to_assign" as const,
  owner: "Maya",
  dueDate: "2026-09-12",
  jiraIssueKey: "SEO-101",
  jiraIssueUrl: "https://customerlabs.atlassian.net/browse/SEO-101",
  savedKeywordIds: ["kw_primary", "kw_variant"],
  primarySavedKeywordId: "kw_primary",
};

describe("ContentExecutionRepository", () => {
  it("creates one page-level item and maps all keyword variants to it", async () => {
    await repository.createExecutionItem(createInput);

    const items = await repository.listExecutionItemsByProject("project_1");
    const summaries = await repository.listSummariesBySavedKeywordIds(
      "project_1",
      ["kw_primary", "kw_variant"],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "item_1",
      primaryKeyword: "meta conversions api",
      keywordCount: 2,
    });
    expect(summaries.get("kw_variant")).toMatchObject({
      id: "item_1",
      status: "ready_to_assign",
      owner: "Maya",
    });
  });

  it("rejects keywords belonging to a different project", async () => {
    await expect(
      repository.createExecutionItem({
        ...createInput,
        savedKeywordIds: ["kw_primary", "kw_foreign"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(
      await repository.listExecutionItemsByProject("project_1"),
    ).toHaveLength(0);
  });

  it("prevents one keyword from silently belonging to two pages", async () => {
    await repository.createExecutionItem(createInput);

    await expect(
      repository.createExecutionItem({
        ...createInput,
        id: "item_2",
        title: "Competing page",
        savedKeywordIds: ["kw_variant"],
        primarySavedKeywordId: "kw_variant",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("updates only an item owned by the requested project", async () => {
    await repository.createExecutionItem(createInput);

    await expect(
      repository.updateExecutionItem({
        projectId: "project_2",
        executionItemId: "item_1",
        status: "writing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [item] = await repository.listExecutionItemsByProject("project_1");
    expect(item?.status).toBe("ready_to_assign");
  });
});
