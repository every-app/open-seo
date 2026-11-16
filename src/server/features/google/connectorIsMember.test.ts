import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type * as GscServiceModule from "@/server/features/gsc/services/GscService";
import type * as Ga4ServiceModule from "@/server/features/ga4/services/Ga4Service";

const usesBetterAuthServer = vi.hoisted(() => vi.fn());
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({ usesBetterAuthServer }));

let client: Client;
const directory = mkdtempSync(join(tmpdir(), "connector-is-member-"));
let gsc: typeof GscServiceModule.GscService;
let ga4: typeof Ga4ServiceModule.Ga4Service;

// Dynamic imports: the services must load after the real SQLite database
// replaces @/db.
beforeAll(async () => {
  client = createClient({ url: `file:${join(directory, "test.db")}` });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE user (id text PRIMARY KEY);
    CREATE TABLE organization (id text PRIMARY KEY);
    CREATE TABLE projects (id text PRIMARY KEY);
    CREATE TABLE member (id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL, role text NOT NULL, created_at integer NOT NULL);
    INSERT INTO user VALUES ('stays'), ('left');
    INSERT INTO organization VALUES ('org1'), ('org2');
    INSERT INTO projects VALUES ('p1'), ('p2');
    INSERT INTO member VALUES ('m1', 'org1', 'stays', 'owner', 0), ('m2', 'org2', 'left', 'owner', 0);
  `);
  for (const file of [
    "drizzle/sqlite/0019_true_absorbing_man.sql",
    "drizzle/sqlite/0039_ga4_connections.sql",
  ]) {
    await client.executeMultiple(
      readFileSync(file, "utf8")
        .split("--> statement-breakpoint")
        .filter((sql) => !sql.includes("ALTER TABLE"))
        .join("\n"),
    );
  }
  await client.executeMultiple(`
    ALTER TABLE gsc_connections ADD gsc_account_id text;
    INSERT INTO gsc_connections (id, project_id, organization_id, site_url, connected_by_user_id)
      VALUES ('g1', 'p1', 'org1', 'https://one.example/', 'stays'), ('g2', 'p2', 'org1', 'https://two.example/', 'left');
    INSERT INTO ga4_connections (id, project_id, organization_id, property_id, property_display_name, property_time_zone, property_currency_code, connected_by_user_id, ga4_account_id)
      VALUES ('a1', 'p1', 'org1', 'properties/1', 'One', 'UTC', 'USD', 'stays', 'google-a'), ('a2', 'p2', 'org1', 'properties/2', 'Two', 'UTC', 'USD', 'left', 'google-b');
  `);
  ({ GscService: gsc } =
    await import("@/server/features/gsc/services/GscService"));
  ({ Ga4Service: ga4 } =
    await import("@/server/features/ga4/services/Ga4Service"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
});

beforeEach(() => {
  usesBetterAuthServer.mockResolvedValue(true);
});

it("stops serving a connection once the member who made it has left the organization", async () => {
  // 'left' is still a member of org2, but the connection belongs to org1.
  expect(await gsc.getConnection("p1")).toMatchObject({ id: "g1" });
  expect(await gsc.getConnection("p2")).toBeNull();
  expect(await ga4.getConnection("p1")).toMatchObject({ id: "a1" });
  expect(await ga4.getConnection("p2")).toBeNull();
});

it("keeps every connection where there are no member rows to check", async () => {
  usesBetterAuthServer.mockResolvedValue(false);
  expect(await gsc.getConnection("p2")).toMatchObject({ id: "g2" });
  expect(await ga4.getConnection("p2")).toMatchObject({ id: "a2" });
});
