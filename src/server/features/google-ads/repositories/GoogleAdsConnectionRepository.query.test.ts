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
import type * as GoogleAdsConnectionRepositoryModule from "./GoogleAdsConnectionRepository";

// Real in-memory SQLite. The contract under test is that unlinkGrantIfUnused
// decides "is another project still using this grant?" *inside* the DELETE, so
// only generated SQL can show it; a mocked builder chain would pass either way.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GoogleAdsConnectionRepository: typeof GoogleAdsConnectionRepositoryModule.GoogleAdsConnectionRepository;

/** The statements of a real migration that touch one table, so the columns the
 *  delete's predicate resolves against can't drift from production DDL. */
function migrationStatements(file: string, table: string): string[] {
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .filter((statement) => statement.includes(`\`${table}\``));
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // doMock + dynamic import: the repository captures `db` at module load, so
  // the fake must exist before the module is first evaluated.
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(
    [
      // Stubs for the FK targets; nothing here exercises them.
      `CREATE TABLE user (id text PRIMARY KEY);`,
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `CREATE TABLE organization (id text PRIMARY KEY);`,
      `INSERT INTO user (id) VALUES ('user_1');`,
      `INSERT INTO projects (id) VALUES ('proj_a'), ('proj_b');`,
      `INSERT INTO organization (id) VALUES ('org_1');`,
      ...migrationStatements("drizzle/0003_light_sage.sql", "account"),
      ...migrationStatements(
        "drizzle/0048_google_ads_connections.sql",
        "google_ads_connections",
      ),
    ].join("\n"),
  );

  ({ GoogleAdsConnectionRepository } =
    await import("./GoogleAdsConnectionRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM google_ads_connections;
    DELETE FROM account;
    INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
      VALUES ('acct_1', 'google-sub-1', 'google-ads', 'user_1', 0);
  `);
});

function connectProject(projectId: string, connectedByUserId = "user_1") {
  return client.execute({
    sql: `INSERT INTO google_ads_connections
            (id, project_id, organization_id, customer_id,
             connected_by_user_id, google_ads_account_id)
          VALUES (?, ?, 'org_1', '1234567890', ?, 'google-sub-1')`,
    args: [`conn_${projectId}`, projectId, connectedByUserId],
  });
}

async function grantCount(): Promise<number> {
  const result = await client.execute(
    `SELECT id FROM account WHERE provider_id = 'google-ads'`,
  );
  return result.rows.length;
}

describe("GoogleAdsConnectionRepository.unlinkGrantIfUnused", () => {
  it("keeps a grant another project is still connected through", async () => {
    await connectProject("proj_b");
    await GoogleAdsConnectionRepository.unlinkGrantIfUnused(
      "user_1",
      "google-sub-1",
    );
    expect(await grantCount()).toBe(1);
  });

  it("releases a grant no project points at anymore", async () => {
    await GoogleAdsConnectionRepository.unlinkGrantIfUnused(
      "user_1",
      "google-sub-1",
    );
    expect(await grantCount()).toBe(0);
  });
});
