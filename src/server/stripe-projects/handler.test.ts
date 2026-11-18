import { createHash } from "node:crypto";
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
import type * as ConnectionsModule from "@/server/mcp/connections";
import type * as HandlerModule from "./handler";
import { SECRET, sign, stripeCaller } from "./handler-test-support";

// Real in-memory SQLite built from the shipped migration: refresh rotation,
// per-user resource scoping and the Settings disconnect are all enforced by
// the queries (conditional update, scoped deletes), which a mocked builder
// chain can't verify. Codes and login links live in Better Auth's verification
// store, stood in for by a map.

const mocks = vi.hoisted(() => ({
  secret: { value: "whsec_test_secret" as string | undefined },
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createApiKey: vi.fn(),
  getMembership: vi.fn(),
  verifications: new Map<string, { value: string; expiresAt: Date }>(),
}));

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => mocks.secret.value,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerError: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://app.openseo.so",
  getAuth: () => ({
    $context: Promise.resolve({
      internalAdapter: {
        findUserByEmail: mocks.findUserByEmail,
        createUser: mocks.createUser,
        createVerificationValue: async (row: {
          identifier: string;
          value: string;
          expiresAt: Date;
        }) => mocks.verifications.set(row.identifier, row),
        findVerificationValue: async (identifier: string) =>
          mocks.verifications.get(identifier) ?? null,
        consumeVerificationValue: async (identifier: string) => {
          const row = mocks.verifications.get(identifier) ?? null;
          mocks.verifications.delete(identifier);
          return row;
        },
      },
    }),
    api: { createApiKey: mocks.createApiKey, createOrganization: vi.fn() },
  }),
}));
vi.mock("@/server/auth/default-hosted-organization", () => ({
  resolveActiveHostedOrganization: async () => ({
    organizationId: "org-1",
    role: "owner",
  }),
}));
vi.mock("@/server/mcp/oauth-provider", () => ({
  getCapturedOAuthHelpers: () => ({
    listUserGrants: async () => ({ items: [] }),
  }),
}));
vi.mock("@/server/auth/repositories/GuestAccountRepository", () => ({
  GuestAccountRepository: { listClaimedGuestUserIds: async () => [] },
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    getMembership: mocks.getMembership,
    setLastActiveOrganization: vi.fn(),
  },
}));

let client: Client;
let handleStripeProjectsRequest: typeof HandlerModule.handleStripeProjectsRequest;
let McpConnectionsService: typeof ConnectionsModule.McpConnectionsService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks (the sanctioned doMock + dynamic import pattern).
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  const migration = readFileSync(
    new URL(
      "../../../drizzle/sqlite/0071_stripe_projects_provider.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await client.executeMultiple(
    `CREATE TABLE user (id TEXT PRIMARY KEY);
     CREATE TABLE organization (id TEXT PRIMARY KEY);
     INSERT INTO user VALUES ('user-1'), ('user-2');
     INSERT INTO organization VALUES ('org-1');
     CREATE TABLE apikey (id TEXT PRIMARY KEY, reference_id TEXT NOT NULL);
     ${migration.replaceAll("--> statement-breakpoint", "")}`,
  );

  ({ handleStripeProjectsRequest } = await import("./handler"));
  ({ McpConnectionsService } = await import("@/server/mcp/connections"));
});

afterAll(() => {
  client.close();
});

const { call, accountRequest, codeFor, exchange, accessToken } = stripeCaller(
  () => handleStripeProjectsRequest,
);

let keyCount = 0;

beforeEach(async () => {
  mocks.secret.value = SECRET;
  mocks.findUserByEmail.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue({ id: "user-1" });
  mocks.getMembership.mockResolvedValue({ role: "owner" });
  mocks.createApiKey.mockImplementation(
    async ({ body }: { body: { userId: string } }) => {
      keyCount += 1;
      const id = `key-${keyCount}`;
      await client.execute({
        sql: "INSERT INTO apikey (id, reference_id) VALUES (?, ?)",
        args: [id, body.userId],
      });
      return { id, key: `oseo_${keyCount}` };
    },
  );
});

describe("handleStripeProjectsRequest", () => {
  it("is off without a signing secret and rejects unsigned or wrongly signed calls", async () => {
    mocks.secret.value = undefined;
    expect((await call("provisioning/health")).status).toBe(404);

    mocks.secret.value = SECRET;
    expect(
      (await call("provisioning/health", { signature: null })).status,
    ).toBe(401);
    expect(
      (
        await call("provisioning/health", {
          signature: sign("", "whsec_other"),
        })
      ).status,
    ).toBe(401);
    expect((await call("provisioning/health")).status).toBe(200);
  });

  it("refuses an email Stripe has not verified without creating an account", async () => {
    for (const kyc of [{ verified_fields: ["name"] }, undefined]) {
      const response = await accountRequest({ kyc });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        id: "acctreq_1",
        type: "error",
        error: { code: "requires_kyc" },
      });
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses to link an OpenSEO account that never confirmed its email", async () => {
    mocks.findUserByEmail.mockResolvedValue({
      user: { id: "user-1", emailVerified: false },
    });

    const response = await accountRequest();

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden" },
    });
  });

  it("redeems a code once, and a PKCE code only with its verifier", async () => {
    const code = await codeFor();
    // Stripe's "Dev@Example.com" must match a later Google sign-in.
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@example.com" }),
    );
    const first = await exchange({ grant_type: "authorization_code", code });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      token_type: "bearer",
      account: { id: "org-1", payment_credentials: "provider" },
    });
    const replay = await exchange({ grant_type: "authorization_code", code });
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });

    const verifier = "v".repeat(64);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const pkceCode = await codeFor({
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const wrong = await exchange(
      {
        grant_type: "authorization_code",
        code: pkceCode,
        code_verifier: "w".repeat(64),
      },
      false,
    );
    expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });
    const right = await exchange(
      {
        grant_type: "authorization_code",
        code: pkceCode,
        code_verifier: verifier,
      },
      false,
    );
    expect(right.status).toBe(200);
  });

  it("rotates the refresh token on use", async () => {
    const tokens = await accessToken();

    const refreshed = await exchange({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    expect(refreshed.status).toBe(200);
    const replay = await exchange({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("gives every provision its own key, which rotate replaces and remove revokes", async () => {
    const { access_token: bearer } = await accessToken();
    const provision = async () => {
      // Stripe sends the same project_id for every resource in a project.
      const response = await call("provisioning/resources", {
        bearer,
        body: JSON.stringify({ service_id: "api", project_id: "proj_1" }),
      });
      const json: {
        id: string;
        complete: { access_configuration: { key: string; mcp_url: string } };
      } = await response.json();
      return json;
    };
    const keyIds = async () =>
      new Set(
        (await client.execute("SELECT id FROM apikey")).rows.map(
          (row) => row.id,
        ),
      );

    const first = await provision();
    const second = await provision();
    expect(second.id).not.toBe(first.id);
    expect(first.complete.access_configuration.mcp_url).toBe(
      "https://app.openseo.so/mcp",
    );
    expect(mocks.createApiKey).toHaveBeenLastCalledWith({
      body: {
        userId: "user-1",
        name: "Stripe Projects",
        metadata: { organizationId: "org-1" },
      },
    });
    const secondKey = `key-${keyCount}`;
    expect(await keyIds()).toEqual(new Set([`key-${keyCount - 1}`, secondKey]));

    const rotated = await call(
      `provisioning/resources/${first.id}/rotate_credentials`,
      { bearer, body: "{}" },
    );
    expect(rotated.status).toBe(200);
    expect(await keyIds()).toEqual(new Set([secondKey, `key-${keyCount}`]));

    const removed = await call(`provisioning/resources/${first.id}/remove`, {
      bearer,
      body: "",
    });
    expect(await removed.json()).toEqual({ status: "removed", id: first.id });
    expect(await keyIds()).toEqual(new Set([secondKey]));
    const read = await call(`provisioning/resources/${first.id}`, { bearer });
    expect(read.status).toBe(404);
  });

  it("keeps one member's resource out of reach of another member linked to the same Stripe account", async () => {
    const owner = await accessToken();
    const created = await call("provisioning/resources", {
      bearer: owner.access_token,
      body: JSON.stringify({ service_id: "api" }),
    });
    const { id }: { id: string } = await created.json();

    mocks.findUserByEmail.mockResolvedValue({
      user: { id: "user-2", emailVerified: true },
    });
    const other = await accessToken({ email: "teammate@example.com" });

    for (const path of [
      `provisioning/resources/${id}`,
      `provisioning/resources/${id}/rotate_credentials`,
      `provisioning/resources/${id}/remove`,
    ]) {
      const response = await call(path, {
        bearer: other.access_token,
        body: path.endsWith(id) ? undefined : "{}",
      });
      expect(response.status).toBe(404);
    }
  });

  it("stops honouring the bearer once the user leaves the organization", async () => {
    const { access_token: bearer } = await accessToken();
    mocks.getMembership.mockResolvedValue(null);

    const response = await call("provisioning/deep_links", {
      bearer,
      body: JSON.stringify({ purpose: "dashboard" }),
    });

    expect(response.status).toBe(401);
  });

  it("mints dashboard links only for in-app paths", async () => {
    const { access_token: bearer } = await accessToken();
    const link = (path: string) =>
      call("provisioning/deep_links", {
        bearer,
        body: JSON.stringify({ purpose: "dashboard", path }),
      });

    const ok: { url: string } = await (await link("/billing")).json();
    expect(ok.url).toMatch(
      /^https:\/\/app\.openseo\.so\/stripe-projects\/login\?token=/,
    );
    for (const path of ["//evil.com", "/\\evil.com", "https://evil.com"]) {
      expect(await (await link(path)).json()).toMatchObject({
        error: { code: "invalid_path" },
      });
    }
  });
  it("lists the Stripe link under Connected agents, and disconnecting it cuts Stripe off and revokes its keys", async () => {
    await accessToken(); // Linking the same Stripe account twice is one row.
    const { access_token: bearer } = await accessToken();
    await call("provisioning/resources", {
      bearer,
      body: JSON.stringify({ service_id: "api", project_id: "proj_1" }),
    });
    const deepLink = () =>
      call("provisioning/deep_links", {
        bearer,
        body: JSON.stringify({ purpose: "dashboard" }),
      });
    expect((await deepLink()).status).toBe(200);

    expect(
      await McpConnectionsService.listMcpConnections("user-1"),
    ).toMatchObject([
      { kind: "stripe", organizationId: "org-1", stripeAccountId: "acct_1" },
    ]);

    await McpConnectionsService.revokeMcpConnection("user-1", {
      kind: "stripe",
      organizationId: "org-1",
      stripeAccountId: "acct_1",
    });

    expect(await McpConnectionsService.listMcpConnections("user-1")).toEqual(
      [],
    );
    expect((await deepLink()).status).toBe(401);
    expect((await client.execute("SELECT id FROM apikey")).rows).toEqual([]);
  });
});
