import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as ProductUpdatesModule from "./product-updates";

// Real in-memory SQLite so the saved choice is read back from the row.

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "d1",
    LOOPS_API_KEY: "loops-key",
    LOOPS_PRODUCT_UPDATES_LIST_ID: "product-updates-list",
  },
}));

const fetchMock = vi.fn<typeof fetch>();
let client: Client;
let ProductUpdatesService: typeof ProductUpdatesModule.ProductUpdatesService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks (same pattern as AuthRepository.query.test.ts).
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    CREATE TABLE user (id TEXT PRIMARY KEY, updated_at INTEGER, product_updates_opt_in INTEGER, product_updates_changed_at INTEGER);
    INSERT INTO user (id) VALUES ('user-1'), ('user-2');
  `);

  ({ ProductUpdatesService } = await import("./product-updates"));
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

afterAll(() => {
  client.close();
});

it("updates the Loops list and records the choice for only that user", async () => {
  await ProductUpdatesService.setOptIn({
    userId: "user-1",
    email: "ana@example.com",
    optIn: false,
  });

  const body = z.string().parse(fetchMock.mock.calls[0]?.[1]?.body);
  expect(JSON.parse(body)).toEqual({
    email: "ana@example.com",
    userId: "user-1",
    mailingLists: { "product-updates-list": false },
  });
  const { rows } = await client.execute(
    "SELECT product_updates_opt_in, product_updates_changed_at FROM user ORDER BY id",
  );
  expect(rows[0]?.product_updates_opt_in).toBe(0);
  expect(rows[0]?.product_updates_changed_at).toEqual(expect.any(Number));
  expect(rows[1]?.product_updates_opt_in).toBeNull();
});

it("keeps the saved choice when Loops rejects the change", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

  await expect(
    ProductUpdatesService.setOptIn({
      userId: "user-2",
      email: "bo@example.com",
      optIn: true,
    }),
  ).rejects.toThrow();

  const { rows } = await client.execute(
    "SELECT product_updates_opt_in FROM user WHERE id = 'user-2'",
  );
  expect(rows[0]?.product_updates_opt_in).toBeNull();
});
