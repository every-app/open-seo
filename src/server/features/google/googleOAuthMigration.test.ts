import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { expect, it } from "vitest";

const grants = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  updatedAt: integer("updated_at").notNull(),
});

it("keeps one refreshable grant per user and Google identity without changing project bindings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "google-grant-migration-"));
  const client = createClient({ url: `file:${join(directory, "test.db")}` });
  try {
    await client.executeMultiple(`
      CREATE TABLE account (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        provider_id text NOT NULL,
        account_id text NOT NULL,
        access_token text,
        refresh_token text,
        updated_at integer NOT NULL
      );
      CREATE TABLE gsc_connections (
        project_id text PRIMARY KEY,
        connected_by_user_id text NOT NULL,
        gsc_account_id text
      );
      INSERT INTO account VALUES
        ('old-refresh', 'user-1', 'google-search-console', 'google-1', 'old-access', 'refresh', 1),
        ('new-no-refresh', 'user-1', 'google-search-console', 'google-1', 'new-access', NULL, 2),
        ('other-user', 'user-2', 'google-search-console', 'google-1', 'access', 'refresh', 1),
        ('analytics', 'user-1', 'google-analytics', 'google-1', 'access', 'refresh', 1),
        ('sign-in-a', 'user-1', 'google', 'google-1', 'access', NULL, 1),
        ('sign-in-b', 'user-1', 'google', 'google-1', 'access', NULL, 2);
      INSERT INTO gsc_connections VALUES ('project-1', 'user-1', 'google-1');
    `);

    const migration = readFileSync(
      "drizzle/sqlite/0054_famous_crystal.sql",
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");
    await client.executeMultiple(migration);

    const existingGrants = await client.execute(
      "SELECT id FROM account WHERE provider_id = 'google-search-console' ORDER BY id",
    );
    expect(existingGrants.rows.map((row) => row.id)).toEqual([
      "old-refresh",
      "other-user",
    ]);
    const bindings = await client.execute("SELECT * FROM gsc_connections");
    expect(bindings.rows).toHaveLength(1);
    expect(bindings.rows[0]?.gsc_account_id).toBe("google-1");
    const signIns = await client.execute(
      "SELECT id FROM account WHERE provider_id = 'google'",
    );
    expect(signIns.rows).toHaveLength(2);

    await expect(
      client.execute(
        "INSERT INTO account VALUES ('duplicate', 'user-1', 'google-search-console', 'google-1', 'access', NULL, 3)",
      ),
    ).rejects.toThrow();

    const db = drizzle(client);
    await Promise.all(
      [null, "new-refresh"].map((refreshToken, index) =>
        db
          .insert(grants)
          .values({
            id: `callback-${index}`,
            userId: "user-3",
            providerId: "google-analytics",
            accountId: "google-2",
            accessToken: `access-${index}`,
            refreshToken,
            updatedAt: index,
          })
          .onConflictDoUpdate({
            target: [grants.userId, grants.providerId, grants.accountId],
            targetWhere: sql`${grants.providerId} in ('google-search-console', 'google-analytics')`,
            set: {
              accessToken: `access-${index}`,
              refreshToken: sql`coalesce(excluded.refresh_token, ${grants.refreshToken})`,
              updatedAt: index,
            },
          }),
      ),
    );
    const concurrent = await client.execute(
      "SELECT refresh_token FROM account WHERE user_id = 'user-3'",
    );
    expect(concurrent.rows).toHaveLength(1);
    expect(concurrent.rows[0]?.refresh_token).toBe("new-refresh");
  } finally {
    client.close();
    rmSync(directory, { recursive: true });
  }
});
