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
import type * as GuestAccountsModule from "./guest-accounts";

// Real in-memory SQLite: the per-IP count and the claim handover (move the
// membership, delete the guest, keep the IP row) are the parts that matter.

const mockEnv = vi.hoisted(() => ({
  DATABASE_PROVIDER: "d1",
  AUTH_MODE: "hosted",
  BETTER_AUTH_SECRET: "x".repeat(32),
}));
const mocks = vi.hoisted(() => ({
  isFeatureFlagOn: vi.fn(),
  updateCustomer: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));
vi.mock("@/server/lib/featureFlags", () => ({
  FeatureFlag: { PauseMcpGuestAccounts: "pause-mcp-guest-accounts" },
  isFeatureFlagOn: mocks.isFeatureFlagOn,
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { customers: { update: mocks.updateCustomer } },
}));

let client: Client;
let guests: typeof GuestAccountsModule;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks — the one sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      analytics_opted_out INTEGER, terms_accepted_version TEXT,
      terms_accepted_at INTEGER, product_updates_opt_in INTEGER,
      product_updates_changed_at INTEGER, last_active_organization_id TEXT
    );
    CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      role TEXT NOT NULL
    );
    CREATE TABLE guest_accounts (
      user_id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL,
      claim_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
    );
    CREATE TABLE user_onboarding_answers (
      user_id TEXT PRIMARY KEY, organization_id TEXT,
      interested_features TEXT, work_for TEXT, client_website_count TEXT,
      found_via TEXT, mcp_setup_intent TEXT, completed_at TEXT,
      gsc_nudge_dismissed_at TEXT, created_at TEXT, updated_at TEXT
    );
  `);

  guests = await import("./guest-accounts");
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  mocks.isFeatureFlagOn.mockResolvedValue(false);
  mocks.updateCustomer.mockResolvedValue({});
  await client.executeMultiple(`
    DELETE FROM member;
    DELETE FROM organization;
    DELETE FROM guest_accounts;
    DELETE FROM user_onboarding_answers;
    DELETE FROM user;
  `);
});

const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

function connectRequest(ip: string, asn = 7922) {
  const request = new Request("https://app.openseo.so/api/oauth/guest", {
    headers: { "cf-connecting-ip": ip },
  });
  Object.defineProperty(request, "cf", { value: { asn } });
  return request;
}

async function createGuest(ip: string) {
  const request = connectRequest(ip);
  const eligibility = await guests.checkGuestEligibility(
    request,
    CLAUDE_CALLBACK,
  );
  if (!eligibility.eligible) throw new Error(eligibility.reason);
  return guests.createGuestAccount(request, eligibility.ipHash, async (org) => {
    const id = `org-${org.userId}`;
    await client.execute({
      sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
      args: [id, org.name],
    });
    await client.execute({
      sql: "INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')",
      args: [`m-${org.userId}`, id, org.userId],
    });
    return { id };
  });
}

describe("guest accounts", () => {
  it("allows two guests per IP, ever", async () => {
    await createGuest("203.0.113.7");
    await createGuest("203.0.113.7");

    await expect(
      guests.checkGuestEligibility(
        connectRequest("203.0.113.7"),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toEqual({ eligible: false, reason: "ip_limit" });
    await expect(
      guests.checkGuestEligibility(
        connectRequest("203.0.113.8"),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toMatchObject({ eligible: true });
  });

  it("counts an IPv6 home connection's whole /64 as one IP", async () => {
    await createGuest("2001:db8:1:2::1");
    await createGuest("2001:0db8:0001:0002:ffff::9");

    await expect(
      guests.checkGuestEligibility(
        connectRequest("2001:db8:1:2:aaaa:bbbb:cccc:dddd"),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toEqual({ eligible: false, reason: "ip_limit" });
    await expect(
      guests.checkGuestEligibility(
        connectRequest("2001:db8:1:3::1"),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toMatchObject({ eligible: true });
  });

  it("only approves codes headed to an AI app or the person's own computer", async () => {
    const eligible = (redirectUri: string) =>
      guests
        .checkGuestEligibility(connectRequest("203.0.113.9"), redirectUri)
        .then((result) => result.eligible);

    await expect(eligible("http://127.0.0.1:53682/callback")).resolves.toBe(
      true,
    );
    await expect(eligible("cursor://anysphere.cursor-mcp/oauth")).resolves.toBe(
      true,
    );
    await expect(eligible("https://attacker.example/cb")).resolves.toBe(false);
  });

  it("refuses cloud networks and the kill switch", async () => {
    await expect(
      guests.checkGuestEligibility(
        connectRequest("203.0.113.7", 16509),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toEqual({ eligible: false, reason: "cloud_network" });

    mocks.isFeatureFlagOn.mockResolvedValue(true);
    await expect(
      guests.checkGuestEligibility(
        connectRequest("203.0.113.7"),
        CLAUDE_CALLBACK,
      ),
    ).resolves.toEqual({ eligible: false, reason: "paused" });
  });

  it("hands the guest's organization to the account that signs in with the claim cookie", async () => {
    const guest = await createGuest("203.0.113.7");
    await client.execute(
      "INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('real', 'Ana', 'ana@example.com', 0, 0)",
    );
    const headers = new Headers({
      cookie: `other=1; ${guests.GUEST_CLAIM_COOKIE}=${guest.claimToken}`,
    });

    await guests.claimGuestFromCookie(headers, "real");

    const members = await client.execute(
      "SELECT organization_id, user_id FROM member",
    );
    expect(members.rows).toEqual([
      { organization_id: guest.organizationId, user_id: "real" },
    ]);
    // The guest's organization opens next, even for an existing account.
    const claimer = await client.execute(
      "SELECT last_active_organization_id FROM user WHERE id = 'real'",
    );
    expect(claimer.rows).toEqual([
      { last_active_organization_id: guest.organizationId },
    ]);
    // The agent already set the organization up, so the wizard is skipped.
    const onboarding = await client.execute(
      "SELECT completed_at FROM user_onboarding_answers WHERE user_id = 'real'",
    );
    expect(onboarding.rows[0]?.completed_at).toEqual(expect.any(String));
    const guestUser = await client.execute({
      sql: "SELECT id FROM user WHERE id = ?",
      args: [guest.userId],
    });
    expect(guestUser.rows).toEqual([]);
    expect(mocks.updateCustomer).toHaveBeenCalledWith({
      customerId: guest.organizationId,
      email: "ana@example.com",
    });
    // The IP row stays, so claiming doesn't free up a guest slot.
    const ipRows = await client.execute("SELECT user_id FROM guest_accounts");
    expect(ipRows.rows).toHaveLength(1);

    // The cookie outlives the claim; a later sign-in finds nothing to take.
    mocks.updateCustomer.mockClear();
    await guests.claimGuestFromCookie(headers, "someone-else");
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
  });
});
