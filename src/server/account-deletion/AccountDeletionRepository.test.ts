import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sort } from "remeda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeletionRepository } from "./AccountDeletionRepository";

// Real SQL over every SQLite migration: the erase batch leans on foreign-key
// cascades, which a mocked query builder would not exercise.
const state = vi.hoisted(() => ({ database: null as DatabaseSync | null }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", async () => {
  const db = drizzle(async (query, params, method) => {
    if (!state.database) throw new Error("Database not initialized");
    const statement = state.database.prepare(query);
    const values = params.map((value: unknown): SQLInputValue => {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint"
      )
        return value;
      throw new Error("Unexpected SQL parameter");
    });
    if (method === "run") {
      statement.run(...values);
      return { rows: [] };
    }
    const rows = statement.all(...values).map((row) => Object.values(row));
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  });
  return { db };
});
vi.mock("@/db/runBatch", async () => {
  const { db } = await import("@/db");
  return {
    runBatch: async (build: (tx: typeof db) => Promise<unknown>[]) => {
      for (const statement of build(db)) await statement;
    },
  };
});

const query = (sql: string) => state.database?.prepare(sql).all() ?? [];

beforeEach(() => {
  state.database?.close();
  state.database = new DatabaseSync(":memory:");
  const migrations = sort(
    readdirSync("drizzle/sqlite").filter((name) => name.endsWith(".sql")),
    (a, b) => a.localeCompare(b),
  );
  for (const file of migrations) {
    state.database.exec(readFileSync(`drizzle/sqlite/${file}`, "utf8"));
  }
  state.database.exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
      ('alice', 'Alice', 'alice@example.com', 1, 0, 0),
      ('bob', 'Bob', 'bob@example.com', 1, 0, 0);
    INSERT INTO organization (id, name, slug, created_at) VALUES
      ('org-solo', 'Solo', 'solo', 0),
      ('org-shared', 'Shared', 'shared', 0);
    INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
      ('m1', 'org-solo', 'alice', 'owner', 0),
      ('m2', 'org-shared', 'bob', 'owner', 0),
      ('m3', 'org-shared', 'alice', 'admin', 0);
    INSERT INTO projects (id, organization_id, name) VALUES
      ('p-solo', 'org-solo', 'Solo project'),
      ('p-shared', 'org-shared', 'Shared project');
    INSERT INTO reports (id, project_id, title, summary, html, created_by, created_by_user_id, size_bytes, share_token) VALUES
      ('r-shared', 'p-shared', 'Report', '', '', 'user', 'alice', 0, 'token');
    INSERT INTO account_deletion_requests (user_id, requested_at, delete_after) VALUES
      ('alice', '2026-11-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z');
  `);
});

describe("account erasure", () => {
  it("deletes only workspaces nobody else is in, and keeps shared work unattributed", async () => {
    expect(
      await AccountDeletionRepository.listOrganizations("alice"),
    ).toMatchObject([
      { id: "org-shared", memberCount: 2 },
      { id: "org-solo", memberCount: 1 },
    ]);

    // org-shared is passed too, as if a member joined after it was listed.
    await AccountDeletionRepository.eraseUser({
      userId: "alice",
      email: "alice@example.com",
      organizationIds: ["org-solo", "org-shared"],
    });

    expect(query("SELECT id FROM user")).toEqual([{ id: "bob" }]);
    expect(query("SELECT id FROM organization")).toEqual([
      { id: "org-shared" },
    ]);
    expect(query("SELECT id FROM projects")).toEqual([{ id: "p-shared" }]);
    expect(
      query("SELECT created_by_user_id, share_token FROM reports"),
    ).toEqual([{ created_by_user_id: "gdpr-deleted-user", share_token: null }]);
    expect(query("SELECT * FROM account_deletion_requests")).toEqual([]);
  });

  it("doesn't revoke a Google account another user also connected", async () => {
    state.database?.exec(`
      INSERT INTO account (id, account_id, provider_id, user_id, updated_at) VALUES
        ('a1', 'google-shared', 'google-search-console', 'alice', 0),
        ('a2', 'google-shared', 'google-search-console', 'bob', 0),
        ('a3', 'google-own', 'google-search-console', 'alice', 0);
    `);

    const inventory = await AccountDeletionRepository.buildInventory("alice", [
      "org-solo",
    ]);

    expect(inventory.googleAccounts).toEqual([
      { providerId: "google-search-console", accountId: "google-own" },
    ]);
  });
});
