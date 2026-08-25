import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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
import type * as ProjectContextRepositoryModule from "./ProjectContextRepository";

// Real in-memory SQLite so the upsert conflict clauses run as generated SQL —
// which stored fields an omitted value preserves is the whole contract, and a
// mocked builder chain can't see it.

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

// The executor the service hands these builders inside runBatch.
type Tx = Parameters<
  typeof ProjectContextRepositoryModule.ProjectContextRepository.upsertKeyPages
>[0];

let client: Client;
let tx: Tx;
let ProjectContextRepository: typeof ProjectContextRepositoryModule.ProjectContextRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the libsql client is the same Drizzle query surface runBatch passes in
  tx = testDb as unknown as Tx;

  // The tables come from the real migration, so the unique indexes the
  // upserts' ON CONFLICT clauses resolve against can't drift from production
  // DDL. The sam_project_memory DROP is skipped (nothing created it here);
  // a stub projects table satisfies the FKs.
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_1');`,
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
    ].join("\n"),
  );

  ({ ProjectContextRepository } = await import("./ProjectContextRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  vi.useFakeTimers();
  await client.executeMultiple(`
    DELETE FROM project_key_pages;
    DELETE FROM project_competitors;
  `);
});

afterEach(() => {
  vi.useRealTimers();
});

const PROJECT_ID = "proj_1";

async function runStatements(statements: Promise<unknown>[]) {
  for (const statement of statements) await statement;
}

describe("upsertKeyPages", () => {
  it("keeps the stored role when the caller omits it", async () => {
    vi.setSystemTime("2026-08-01T00:00:00.000Z");
    await runStatements(
      ProjectContextRepository.upsertKeyPages(
        tx,
        PROJECT_ID,
        [
          {
            url: "https://acme.com/pricing",
            role: "money",
            topic: null,
            notes: null,
          },
        ],
        "user",
      ),
    );

    vi.setSystemTime("2026-08-02T00:00:00.000Z");
    await runStatements(
      ProjectContextRepository.upsertKeyPages(
        tx,
        PROJECT_ID,
        [
          {
            url: "https://acme.com/pricing",
            role: null,
            topic: "Pricing",
            notes: "Compare against acme.io",
          },
        ],
        "mcp",
      ),
    );

    expect(await ProjectContextRepository.listKeyPages(PROJECT_ID)).toEqual([
      expect.objectContaining({
        url: "https://acme.com/pricing",
        role: "money",
        topic: "Pricing",
        notes: "Compare against acme.io",
        updatedAt: "2026-08-02T00:00:00.000Z",
        updatedBy: "mcp",
      }),
    ]);
  });
});

describe("upsertCompetitors", () => {
  it("keeps stored notes when the caller omits them", async () => {
    await runStatements(
      ProjectContextRepository.upsertCompetitors(
        tx,
        PROJECT_ID,
        [{ domain: "acme.com", name: null, notes: "user note" }],
        "user",
      ),
    );

    await runStatements(
      ProjectContextRepository.upsertCompetitors(
        tx,
        PROJECT_ID,
        [{ domain: "acme.com", name: "Acme", notes: null }],
        "mcp",
      ),
    );

    expect(await ProjectContextRepository.listCompetitors(PROJECT_ID)).toEqual([
      expect.objectContaining({
        domain: "acme.com",
        name: "Acme",
        notes: "user note",
      }),
    ]);
  });
});
