import { DatabaseSync } from "node:sqlite";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ga4ConnectionRepository } from "./Ga4ConnectionRepository";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  connectedAccountEmail: undefined as SQL | undefined,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));

function evaluateConnectedAccountEmail(expression: SQL): string | null {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table ga4_connections (
      connected_by_user_id text not null,
      ga4_account_id text not null,
      connected_account_email text
    );
    insert into ga4_connections values ('old-user', 'old-account', 'old@example.com');
  `);
  const query = new SQLiteSyncDialect().sqlToQuery(expression);
  const params = query.params.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return value;
    }
    throw new Error("Unexpected SQL parameter type in repository test.");
  });
  const row: unknown = database
    .prepare(`select ${query.sql} as email from ga4_connections`)
    .get(...params);
  database.close();
  if (!row || typeof row !== "object" || !("email" in row)) {
    throw new Error("Repository test query did not return an email column.");
  }
  if (row.email !== null && typeof row.email !== "string") {
    throw new Error("Repository test query returned an invalid email value.");
  }
  return row.email;
}

describe("Ga4ConnectionRepository", () => {
  beforeEach(() => {
    mocks.connectedAccountEmail = undefined;
    mocks.insert.mockImplementation(() => {
      const builder = {
        values: vi.fn(),
        onConflictDoUpdate: vi.fn(),
        returning: vi.fn().mockResolvedValue([{ id: "connection-1" }]),
      };
      builder.values.mockReturnValue(builder);
      builder.onConflictDoUpdate.mockImplementation(
        (input: { set: { connectedAccountEmail: SQL } }) => {
          mocks.connectedAccountEmail = input.set.connectedAccountEmail;
          return builder;
        },
      );
      return builder;
    });
  });

  it.each([
    ["old-user", "old-account", "old@example.com"],
    ["new-user", "old-account", null],
    ["old-user", "new-account", null],
  ] as const)(
    "preserves a missing email only for the same user and account",
    async (connectedByUserId, ga4AccountId, expectedEmail) => {
      await Ga4ConnectionRepository.upsert({
        projectId: "project-1",
        organizationId: "organization-1",
        propertyId: "properties/11",
        propertyDisplayName: "Site",
        propertyTimeZone: "America/New_York",
        propertyCurrencyCode: "USD",
        connectedByUserId,
        ga4AccountId,
        connectedAccountEmail: null,
      });

      expect(mocks.connectedAccountEmail).toBeDefined();
      expect(evaluateConnectedAccountEmail(mocks.connectedAccountEmail!)).toBe(
        expectedEmail,
      );
    },
  );
});
