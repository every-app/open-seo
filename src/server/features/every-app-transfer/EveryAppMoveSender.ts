import { env } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { z } from "zod";
import { getDatabaseProvider } from "@/db/provider";
import type { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { normalizeAndValidateStartUrl } from "@/server/lib/audit/url-policy";
import {
  parseTransferCode,
  TransferProblem,
} from "@/shared/every-app-transfer";
import {
  EVERY_APP_TRANSFER_PATH,
  EXCLUDED_TABLES,
  FILE_KEY_PARAM,
  FILE_METADATA_HEADER,
  SCHEMA_VERSION,
  transferRefusalSchema,
  type TransferCommand,
} from "./protocol";

// The self-hosted side of a move to OpenSEO on an Every App Gateway. The
// dialog drives it one step at a time, and each step sends one more part of
// this install's data to the Gateway install named in the transfer code.
// Every step is safe to repeat: the Gateway install skips rows, messages and
// files it already has.

const ROWS_PER_READ = 50;
const FILES_PER_LIST = 25;
// How long one step keeps sending before it hands back to the dialog.
const STEP_BUDGET_MS = 4_000;
// The largest request body a step sends at once.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES_PER_REQUEST = 500;
// The app's own table names. Internal tables (SQLite's, D1's, and the
// Docker edition's _litestream_*, which refuse every query) never move.
const TABLE_NAME_PATTERN = /^(?!sqlite_)[a-z][a-z0-9_]*$/;

/** A refused or failed move, shown in the dialog by its problem. */
export class MoveRefusedError extends Error {
  constructor(readonly problem: TransferProblem) {
    super(problem);
    this.name = "MoveRefusedError";
  }
}

type Target = { origin: string; secret: string };

async function targetFor(code: string): Promise<Target> {
  const target = parseTransferCode(code);
  if (!target) throw new MoveRefusedError(TransferProblem.InvalidCode);
  try {
    await normalizeAndValidateStartUrl(target.origin);
  } catch {
    throw new MoveRefusedError(TransferProblem.Unreachable);
  }
  return target;
}

async function send(
  target: Target,
  body: BodyInit,
  options: { query?: string; headers?: Record<string, string> } = {},
) {
  let response: Response;
  try {
    response = await fetch(
      `${target.origin}${EVERY_APP_TRANSFER_PATH}${options.query ?? ""}`,
      {
        method: "POST",
        // A Gateway answers its own routes; a redirect means something else
        // is in front of it (a sign-in page), and is never followed.
        redirect: "manual",
        headers: {
          authorization: `Bearer ${target.secret}`,
          ...options.headers,
        },
        body,
      },
    );
  } catch (error) {
    console.error("Every App move: request failed", error);
    throw new MoveRefusedError(TransferProblem.Unreachable);
  }
  if (response.ok) return;
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not one of ours: logged below.
  }
  const refusal = transferRefusalSchema.safeParse(json);
  if (refusal.success) {
    throw new MoveRefusedError(refusal.data.problem);
  }
  console.error(
    `Every App move: ${response.status} from the Gateway install: ${text.slice(0, 500)}`,
  );
  throw new MoveRefusedError(TransferProblem.Unreachable);
}

function sendCommand(target: Target, command: TransferCommand) {
  return send(target, JSON.stringify(command), {
    headers: { "content-type": "application/json" },
  });
}

async function all<T>(sql: string, ...params: unknown[]) {
  const { results } = await env.DB.prepare(sql)
    .bind(...params)
    .all<T>();
  return results;
}

// Work started in the last day is still running and wouldn't finish on the
// Gateway. Older rows still marked running are stuck, and move as they are.
async function hasRunningWork() {
  const [row] = await all<{ running: number }>(
    `SELECT
       EXISTS(SELECT 1 FROM audits WHERE status = 'running' AND julianday(started_at) > julianday('now', '-1 day'))
       OR EXISTS(SELECT 1 FROM rank_check_runs WHERE status IN ('pending', 'running') AND julianday(started_at) > julianday('now', '-1 day'))
       OR EXISTS(SELECT 1 FROM ai_runs WHERE status IN ('queued', 'running') AND julianday(created_at) > julianday('now', '-1 day'))
       OR EXISTS(SELECT 1 FROM local_rank_scans WHERE status IN ('queued', 'running') AND julianday(created_at) > julianday('now', '-1 day'))
       AS running`,
  );
  return row?.running === 1;
}

/** The tables a move carries, parents before the rows that reference them. */
async function movableTables() {
  const names = (
    await all<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table'",
    )
  )
    .map((row) => row.name)
    .filter(
      (name) => TABLE_NAME_PATTERN.test(name) && !EXCLUDED_TABLES.has(name),
    );
  const parents = new Map<string, string[]>();
  for (const name of names) {
    const keys = await all<{ table: string }>(
      'SELECT "table" FROM pragma_foreign_key_list(?)',
      name,
    );
    parents.set(
      name,
      keys.map((key) => key.table).filter((table) => table !== name),
    );
  }
  const ordered: string[] = [];
  const pending = new Set(names);
  while (pending.size) {
    const ready = [...pending].filter((name) =>
      (parents.get(name) ?? []).every((parent) => !pending.has(parent)),
    );
    if (ready.length === 0) {
      throw new Error(`Circular table references: ${[...pending].join(", ")}`);
    }
    for (const name of ready) {
      pending.delete(name);
      ordered.push(name);
    }
  }
  return ordered;
}

async function countRows(table: string) {
  const [row] = await all<{ count: number }>(
    `SELECT count(*) AS count FROM "${table}"`,
  );
  return row?.count ?? 0;
}

/**
 * A move sends the whole install, so every step checks the install is the
 * caller's to send: password accounts can hold more than one organization.
 */
async function requireWholeInstall(options: { passwordMode: boolean }) {
  if (getDatabaseProvider() !== "d1") {
    throw new Error("Moving to Every App needs the SQLite database");
  }
  if (!options.passwordMode) return;
  const [row] = await all<{ count: number }>(
    "SELECT count(*) AS count FROM organization",
  );
  if ((row?.count ?? 0) > 1) {
    throw new MoveRefusedError(TransferProblem.MultipleOrganizations);
  }
}

/**
 * Checks this install can move, starts the move on the Gateway install and
 * returns what the dialog will send.
 */
async function startMove(code: string) {
  const target = await targetFor(code);
  if (await hasRunningWork()) {
    throw new MoveRefusedError(TransferProblem.RunningWork);
  }
  const users = await all<{ id: string; email: string; name: string }>(
    'SELECT id, email, name FROM "user"',
  );
  await sendCommand(target, {
    command: "begin",
    schema: SCHEMA_VERSION,
    users,
  });
  const tables = [];
  for (const table of await movableTables()) {
    tables.push({ table, rows: await countRows(table) });
  }
  return {
    tables,
    chats: tables.find((entry) => entry.table === "sam_sessions")?.rows ?? 0,
  };
}

// Rows in request-sized groups.
function* byRequestSize<T>(items: T[], maxCount: number) {
  let group: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = JSON.stringify(item).length;
    if (
      group.length &&
      (bytes + size > MAX_REQUEST_BYTES || group.length >= maxCount)
    ) {
      yield group;
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += size;
  }
  if (group.length) yield group;
}

/** Sends a table's rows after `after` (a rowid) until the step's time is up. */
async function sendRows(code: string, table: string, after: number) {
  const target = await targetFor(code);
  if (EXCLUDED_TABLES.has(table) || !TABLE_NAME_PATTERN.test(table)) {
    throw new Error(`Not a movable table: ${table}`);
  }
  const columns = (
    await all<{ name: string }>("SELECT name FROM pragma_table_info(?)", table)
  ).map((column) => column.name);
  if (columns.length === 0) throw new Error(`Not a movable table: ${table}`);
  const deadline = Date.now() + STEP_BUDGET_MS;
  let cursor = after;
  let sent = 0;
  for (;;) {
    const rows = await all<Record<string, string | number | null>>(
      `SELECT rowid AS move_rowid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      cursor,
      ROWS_PER_READ,
    );
    const values = rows.map((row) => columns.map((column) => row[column]));
    for (const group of byRequestSize(values, ROWS_PER_READ)) {
      await sendCommand(target, {
        command: "rows",
        table,
        columns,
        rows: group,
      });
    }
    sent += rows.length;
    const last = rows.at(-1);
    if (last) cursor = Number(last.move_rowid);
    const done = rows.length < ROWS_PER_READ;
    if (done || Date.now() > deadline) return { sent, after: cursor, done };
  }
}

/** Sends the conversation at `index`. */
async function sendChat(code: string, index: number) {
  const target = await targetFor(code);
  const [session] = await all<{ id: string }>(
    "SELECT id FROM sam_sessions ORDER BY rowid LIMIT 1 OFFSET ?",
    index,
  );
  if (!session) return { sent: 0 };
  const namespace =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- env.d.ts declares the DO binding untyped; it is this class
    env.SAM_CHAT as unknown as DurableObjectNamespace<SamChatAgent>;
  const agent = await getAgentByName(namespace, session.id);
  const messages = z
    .array(z.unknown())
    .parse(JSON.parse(await agent.exportTranscript()));
  for (const group of byRequestSize(messages, MAX_MESSAGES_PER_REQUEST)) {
    await sendCommand(target, {
      command: "chat",
      sessionId: session.id,
      messages: group,
    });
  }
  return { sent: 1 };
}

/** Sends stored files from `cursor` until the step's time is up. */
async function sendFiles(code: string, cursor: string | null) {
  const target = await targetFor(code);
  const deadline = Date.now() + STEP_BUDGET_MS;
  let next = cursor;
  let sent = 0;
  for (;;) {
    const listed = await env.R2.list({
      cursor: next ?? undefined,
      limit: FILES_PER_LIST,
    });
    for (const { key } of listed.objects) {
      const object = await env.R2.get(key);
      if (!object) continue;
      await send(target, await object.arrayBuffer(), {
        query: `?${FILE_KEY_PARAM}=${encodeURIComponent(key)}`,
        headers: {
          [FILE_METADATA_HEADER]: JSON.stringify({
            httpMetadata: object.httpMetadata,
            customMetadata: object.customMetadata,
          }),
        },
      });
      sent += 1;
    }
    next = listed.truncated ? listed.cursor : null;
    if (!next || Date.now() > deadline) return { sent, cursor: next };
  }
}

/** The last step: the Gateway install's code stops working. */
async function finishMove(code: string) {
  await sendCommand(await targetFor(code), { command: "finish" });
}

export const EveryAppMoveSender = {
  requireWholeInstall,
  startMove,
  sendRows,
  sendChat,
  sendFiles,
  finishMove,
} as const;
