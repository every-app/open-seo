import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { CURRENT_TERMS_VERSION } from "@/shared/terms";
import type * as TermsAcceptanceModule from "./terms-acceptance";

// Real in-memory SQLite so the recorded acceptance is read back from the row.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let TermsAcceptanceService: typeof TermsAcceptanceModule.TermsAcceptanceService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks (same pattern as AuthRepository.query.test.ts).
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    CREATE TABLE user (id TEXT PRIMARY KEY, updated_at INTEGER, terms_accepted_version TEXT, terms_accepted_at INTEGER);
    INSERT INTO user (id) VALUES ('user-1'), ('user-2');
  `);

  ({ TermsAcceptanceService } = await import("./terms-acceptance"));
});

afterAll(() => {
  client.close();
});

it("records the current terms version for only the accepting user", async () => {
  await TermsAcceptanceService.acceptCurrentTerms("user-1");

  const { rows } = await client.execute(
    "SELECT id, terms_accepted_version, terms_accepted_at FROM user ORDER BY id",
  );
  expect(rows[0]?.terms_accepted_version).toBe(CURRENT_TERMS_VERSION);
  expect(rows[0]?.terms_accepted_at).toEqual(expect.any(Number));
  expect(rows[1]?.terms_accepted_version).toBeNull();
});
