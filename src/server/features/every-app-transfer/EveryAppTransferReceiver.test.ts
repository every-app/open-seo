import { readdirSync, readFileSync } from "node:fs";
import { createClient, type Client, type InArgs } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sort } from "remeda";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type * as ReceiverModule from "./EveryAppTransferReceiver";
import { SCHEMA_VERSION } from "./protocol";

// Real in-memory SQLite built from every shipped migration: who each moved
// row ends up belonging to is decided by the inserts and their conflicts,
// which a mocked database can't show. Only the Gateway's member list is
// stood in for.

const mocks = vi.hoisted(() => ({
  env: { DATABASE_PROVIDER: "d1" } as Record<string, unknown>,
  listMembers: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@every-app/sdk/server", () => ({ listMembers: mocks.listMembers }));
vi.mock("agents", () => ({ getAgentByName: vi.fn() }));

let client: Client;
let Receiver: typeof ReceiverModule.EveryAppTransferReceiver;

// The slice of D1's API the receiver uses, over the libsql client.
function d1(database: Client) {
  const statement = (sql: string, args: InArgs = []) => ({
    sql,
    args,
    bind: (...values: InArgs extends (infer T)[] ? T[] : never) =>
      statement(sql, values),
    all: async () => ({
      results: (await database.execute({ sql, args })).rows,
    }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: (statements: { sql: string; args: InArgs }[]) =>
      database.batch(statements, "write"),
  };
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // testDb only exists at runtime, so the module under test must load after
  // these mocks (the sanctioned doMock + dynamic import pattern).
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  mocks.env.DB = d1(client);

  const directory = new URL("../../../../drizzle/sqlite/", import.meta.url);
  const migrations = sort(
    readdirSync(directory).filter((name) => name.endsWith(".sql")),
    (a, b) => a.localeCompare(b),
  );
  for (const file of migrations) {
    await client.executeMultiple(
      readFileSync(new URL(file, directory), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
  ({ EveryAppTransferReceiver: Receiver } =
    await import("./EveryAppTransferReceiver"));
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM every_app_transfers;
    DELETE FROM projects;
    DELETE FROM "user";
    DELETE FROM organization;
    INSERT INTO organization (id, name, slug, created_at) VALUES ('shared-workspace', 'Shared organization', 'shared-workspace', 0);
    INSERT INTO "user" (id, name, email, email_verified) VALUES ('maker', 'maker', 'maker@acme.com', 1);
    INSERT INTO projects (id, organization_id, name) VALUES ('own-default', 'shared-workspace', 'Default');
  `);
  mocks.listMembers.mockResolvedValue({
    members: [
      { id: "maker", email: "maker@acme.com", name: "", role: "owner" },
      { id: "gw-ann", email: "ann@acme.com", name: "Ann", role: "member" },
    ],
  });
});

function makeCode() {
  return Receiver.createTransferCode({
    userId: "maker",
    origin: "https://openseo.acme.com",
  });
}

async function startMove() {
  const made = await makeCode();
  if (!made) throw new Error("No transfer code");
  const secret = made.code.split("#")[1];
  const send = (body: unknown) =>
    Receiver.handleTransferRequest(
      new Request("https://openseo.acme.com/api/every-app-transfer", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(body),
      }),
    );
  const begun = await send({
    command: "begin",
    schema: SCHEMA_VERSION,
    users: [
      { id: "old-ann", email: "Ann@acme.com", name: "ann" },
      { id: "old-bob", email: "bob@acme.com", name: "bob" },
    ],
  });
  expect(begun.status).toBe(200);
  return send;
}

async function rows(sql: string) {
  return (await client.execute(sql)).rows.map((row) => ({ ...row }));
}

it("gives moved work to the member with the same email, else to the code's maker", async () => {
  const send = await startMove();
  await send({
    command: "rows",
    table: "projects",
    columns: ["id", "organization_id", "name", "domain"],
    rows: [["acme", "delegated-old-admin", "Acme", "acme.com"]],
  });
  await send({
    command: "rows",
    table: "sam_sessions",
    columns: ["id", "project_id", "user_id"],
    rows: [
      ["chat-ann", "acme", "old-ann"],
      ["chat-bob", "acme", "old-bob"],
    ],
  });

  expect(
    await rows("SELECT id, organization_id FROM projects WHERE id = 'acme'"),
  ).toEqual([{ id: "acme", organization_id: "shared-workspace" }]);
  expect(
    await rows("SELECT id, user_id FROM sam_sessions ORDER BY id"),
  ).toEqual([
    { id: "chat-ann", user_id: "gw-ann" },
    { id: "chat-bob", user_id: "maker" },
  ]);
  expect(await rows(`SELECT id, email FROM "user" ORDER BY id`)).toEqual([
    { id: "gw-ann", email: "ann@acme.com" },
    { id: "maker", email: "maker@acme.com" },
  ]);
});

it("renames a moved Default project beside this workspace's own", async () => {
  const send = await startMove();
  const response = await send({
    command: "rows",
    table: "projects",
    columns: ["id", "organization_id", "name", "domain", "archived_at"],
    rows: [["old-default", "delegated-old-admin", "Default", null, null]],
  });

  expect(response.status).toBe(200);
  expect(await rows("SELECT id, name FROM projects ORDER BY id")).toEqual([
    { id: "old-default", name: "Default (self-hosted)" },
    { id: "own-default", name: "Default" },
  ]);
});

it("moves auto-numbered rows beside this install's own, once", async () => {
  await client.execute(
    "INSERT INTO keyword_metrics (id, project_id, keyword, location_code) VALUES (1, 'own-default', 'own keyword', 2840)",
  );
  const send = await startMove();
  await send({
    command: "rows",
    table: "projects",
    columns: ["id", "organization_id", "name"],
    rows: [["acme", "delegated-old-admin", "Acme"]],
  });
  const metrics = {
    command: "rows",
    table: "keyword_metrics",
    columns: ["id", "project_id", "keyword", "location_code"],
    rows: [[1, "acme", "moved keyword", 2840]],
  };
  await send(metrics);
  await send(metrics);

  expect(
    await rows("SELECT project_id, keyword FROM keyword_metrics ORDER BY id"),
  ).toEqual([
    { project_id: "own-default", keyword: "own keyword" },
    { project_id: "acme", keyword: "moved keyword" },
  ]);
});

it("refuses excluded tables in any case", async () => {
  const send = await startMove();
  const response = await send({
    command: "rows",
    table: "MEMBER",
    columns: ["id", "organization_id", "user_id", "role", "created_at"],
    rows: [["m1", "shared-workspace", "maker", "owner", 0]],
  });

  expect(response.status).toBe(400);
  expect(await rows("SELECT id FROM member")).toEqual([]);
});

it("pauses scheduled work only while a move sent something in the last hour", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    await startMove();
    expect(await Receiver.isTransferRunning()).toBe(true);

    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(await Receiver.isTransferRunning()).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it("makes no new code while a move is running", async () => {
  const send = await startMove();

  expect(await makeCode()).toBeNull();
  expect((await send({ command: "finish" })).status).toBe(200);
});

it("refuses a move from an install with other database migrations", async () => {
  const { code } = (await makeCode()) ?? { code: "" };
  const response = await Receiver.handleTransferRequest(
    new Request("https://openseo.acme.com/api/every-app-transfer", {
      method: "POST",
      headers: { authorization: `Bearer ${code.split("#")[1]}` },
      body: JSON.stringify({
        command: "begin",
        schema: "0000_older",
        users: [],
      }),
    }),
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ problem: "version_mismatch" });
});

it("stops taking requests once the move finishes", async () => {
  const send = await startMove();
  expect((await send({ command: "finish" })).status).toBe(200);

  const after = await send({
    command: "rows",
    table: "projects",
    columns: ["id", "organization_id", "name"],
    rows: [["late", "x", "Late"]],
  });
  expect(after.status).toBe(401);
  expect(await rows("SELECT id FROM projects WHERE id = 'late'")).toEqual([]);
});
