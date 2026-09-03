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
import type * as AuthRepositoryModule from "./AuthRepository";

// Real in-memory SQLite: findFirstFoundedOrganizationIdForUser's NOT EXISTS
// subquery is the referral-abuse gate (an invitee promoted to owner must not
// count as founding the org), which a mocked builder chain can't verify.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let AuthRepository: typeof AuthRepositoryModule.AuthRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks — the one sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT, logo TEXT, created_at INTEGER, metadata TEXT);
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at INTEGER NOT NULL
    );
  `);

  ({ AuthRepository } = await import("./AuthRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.execute("DELETE FROM member");
});

async function insertMember(input: {
  organizationId: string;
  userId: string;
  role: string;
  createdAt: number;
}) {
  await client.execute({
    sql: "INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [
      `${input.organizationId}:${input.userId}`,
      input.organizationId,
      input.userId,
      input.role,
      input.createdAt,
    ],
  });
}

describe("findFirstFoundedOrganizationIdForUser", () => {
  it("returns the org where the user is the founding owner", async () => {
    await insertMember({
      organizationId: "org_own",
      userId: "u1",
      role: "owner",
      createdAt: 1000,
    });
    await insertMember({
      organizationId: "org_own",
      userId: "u2",
      role: "member",
      createdAt: 2000,
    });

    expect(
      await AuthRepository.findFirstFoundedOrganizationIdForUser("u1"),
    ).toBe("org_own");
  });

  it("excludes an org the user joined by invite and was later promoted to owner in", async () => {
    await insertMember({
      organizationId: "org_theirs",
      userId: "founder",
      role: "owner",
      createdAt: 1000,
    });
    await insertMember({
      organizationId: "org_theirs",
      userId: "promoted_invitee",
      role: "owner",
      createdAt: 2000,
    });

    expect(
      await AuthRepository.findFirstFoundedOrganizationIdForUser(
        "promoted_invitee",
      ),
    ).toBeNull();
  });
});
