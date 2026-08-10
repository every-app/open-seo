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
import type * as WorkspaceMergeModule from "./workspace-merge";

// Real in-memory SQLite so the repoint-before-delete ordering, the Default
// rename against the partial unique index, and the org-delete cascades run
// against actual SQL — the parts a mocked db can't see.

const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let WorkspaceMergeService: typeof WorkspaceMergeModule.WorkspaceMergeService;

async function rows(sql: string) {
  return (await client.execute(sql)).rows;
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks — the one sanctioned use of doMock + dynamic import.
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organization (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      domain TEXT,
      archived_at TEXT
    );
    CREATE UNIQUE INDEX projects_one_default_per_organization_idx
      ON projects (organization_id)
      WHERE name = 'Default' AND domain IS NULL AND archived_at IS NULL;
    CREATE TABLE user_onboarding_answers (
      user_id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE
    );
    CREATE TABLE organization_activation_state (
      organization_id TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
      first_mcp_authorized_at TEXT,
      first_mcp_tool_call_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE gsc_connections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      site_url TEXT NOT NULL,
      connected_by_user_id TEXT NOT NULL
    );
    CREATE TABLE ga4_connections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE
    );
  `);

  ({ WorkspaceMergeService } = await import("./workspace-merge"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  mockEnv.AUTH_MODE = "cloudflare_access";
  await client.executeMultiple(`
    DELETE FROM projects;
    DELETE FROM user_onboarding_answers;
    DELETE FROM organization_activation_state;
    DELETE FROM gsc_connections;
    DELETE FROM ga4_connections;
    DELETE FROM organization;
  `);
});

async function seedLegacyWorkspaces() {
  await client.executeMultiple(`
    INSERT INTO organization (id, name, slug) VALUES
      ('shared-workspace', 'Shared workspace', 'shared-workspace'),
      ('delegated-u1', 'ben workspace', 'delegated-ben-1'),
      ('delegated-u2', 'sam workspace', 'delegated-sam-2'),
      ('org_hosted', 'Hosted org', 'hosted');
    INSERT INTO projects (id, organization_id, name, domain, archived_at) VALUES
      ('p-shared', 'shared-workspace', 'Default', NULL, NULL),
      ('p1-default', 'delegated-u1', 'Default', NULL, NULL),
      ('p1-acme', 'delegated-u1', 'Acme', 'acme.com', NULL),
      ('p2-default', 'delegated-u2', 'Default', NULL, NULL),
      ('p-hosted', 'org_hosted', 'Default', NULL, NULL);
    INSERT INTO user_onboarding_answers (user_id, organization_id) VALUES
      ('u1', 'delegated-u1');
    INSERT INTO organization_activation_state
      (organization_id, first_mcp_authorized_at, first_mcp_tool_call_at) VALUES
      ('delegated-u1', '2026-03-01 09:00:00', '2026-03-02 09:00:00'),
      ('delegated-u2', '2026-01-02 09:00:00', NULL);
    INSERT INTO gsc_connections
      (id, project_id, organization_id, site_url, connected_by_user_id) VALUES
      ('gsc1', 'p1-acme', 'delegated-u1', 'sc-domain:acme.com', 'u1');
  `);
}

describe("WorkspaceMergeService", () => {
  it("folds legacy workspaces into the shared workspace and leaves other orgs alone", async () => {
    await seedLegacyWorkspaces();

    await expect(WorkspaceMergeService.countLegacyWorkspaces()).resolves.toBe(
      2,
    );
    await expect(
      WorkspaceMergeService.mergeLegacyWorkspaces(),
    ).resolves.toEqual({ mergedWorkspaces: 2 });

    expect(
      await rows("SELECT id, organization_id, name FROM projects ORDER BY id"),
    ).toEqual([
      expect.objectContaining({
        id: "p-hosted",
        organization_id: "org_hosted",
      }),
      expect.objectContaining({
        id: "p-shared",
        organization_id: "shared-workspace",
        name: "Default",
      }),
      expect.objectContaining({
        id: "p1-acme",
        organization_id: "shared-workspace",
        name: "Acme",
      }),
      expect.objectContaining({
        id: "p1-default",
        organization_id: "shared-workspace",
        name: "Default (ben)",
      }),
      expect.objectContaining({
        id: "p2-default",
        organization_id: "shared-workspace",
        name: "Default (sam)",
      }),
    ]);

    // Legacy orgs are gone; their activation rows cascaded away after the
    // earliest milestones were folded into the shared row.
    expect(await rows("SELECT id FROM organization ORDER BY id")).toEqual([
      expect.objectContaining({ id: "org_hosted" }),
      expect.objectContaining({ id: "shared-workspace" }),
    ]);
    expect(await rows("SELECT * FROM organization_activation_state")).toEqual([
      expect.objectContaining({
        organization_id: "shared-workspace",
        first_mcp_authorized_at: "2026-01-02 09:00:00",
        first_mcp_tool_call_at: "2026-03-02 09:00:00",
      }),
    ]);
    expect(await rows("SELECT organization_id FROM gsc_connections")).toEqual([
      expect.objectContaining({ organization_id: "shared-workspace" }),
    ]);
    expect(
      await rows("SELECT organization_id FROM user_onboarding_answers"),
    ).toEqual([
      expect.objectContaining({ organization_id: "shared-workspace" }),
    ]);
  });

  it("refuses to run outside cloudflare_access mode", async () => {
    await seedLegacyWorkspaces();
    mockEnv.AUTH_MODE = "local_noauth";

    await expect(
      WorkspaceMergeService.mergeLegacyWorkspaces(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Nothing was touched.
    expect(await rows("SELECT count(*) AS n FROM organization")).toEqual([
      expect.objectContaining({ n: 4 }),
    ]);
  });

  it("is a no-op when run again", async () => {
    await seedLegacyWorkspaces();
    await WorkspaceMergeService.mergeLegacyWorkspaces();

    await expect(
      WorkspaceMergeService.mergeLegacyWorkspaces(),
    ).resolves.toEqual({ mergedWorkspaces: 0 });
    await expect(WorkspaceMergeService.countLegacyWorkspaces()).resolves.toBe(
      0,
    );
    // Nothing renamed twice.
    expect(
      await rows("SELECT name FROM projects WHERE id = 'p1-default'"),
    ).toEqual([expect.objectContaining({ name: "Default (ben)" })]);
  });
});
