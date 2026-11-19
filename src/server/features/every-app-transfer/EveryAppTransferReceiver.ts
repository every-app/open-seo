import { env } from "cloudflare:workers";
import { listMembers } from "@every-app/sdk/server";
import { getAgentByName } from "agents";
import { safeValidateUIMessages } from "ai";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { runBatch, runD1ImportBatch } from "@/db/runBatch";
import {
  everyAppTransferUsers,
  everyAppTransfers,
  samSessions,
  user,
} from "@/db/schema";
import { SHARED_WORKSPACE_ORGANIZATION_ID } from "@/server/auth/delegated-organization";
import type { SamChatAgent } from "@/server/features/sam/SamChatAgent";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import {
  formatTransferCode,
  TransferProblem,
} from "@/shared/every-app-transfer";
import {
  EXCLUDED_TABLES,
  FILE_KEY_PARAM,
  FILE_METADATA_HEADER,
  fileMetadataSchema,
  SCHEMA_VERSION,
  transferCommandSchema,
  type TransferCommand,
} from "./protocol";

// The Every App side of a move from a self-hosted OpenSEO: the transfer code
// an owner or admin makes, and the public route the self-hosted install sends
// its data to (src/server.ts). The code's secret is the route's only gate.

const CODE_LIFETIME_MS = 24 * 60 * 60 * 1000;
// A move that has sent nothing for this long was left halfway, so scheduled
// work runs again.
const ACTIVE_MOVE_MS = 60 * 60 * 1000;
// One active "Default" project with no domain is allowed per workspace, and
// this one already has its own.
const MOVED_DEFAULT_PROJECT_NAME = "Default (self-hosted)";
// The most one moved file may hold: the Workers request body limit, which the
// sender, reading each file whole, never comes near.
const MAX_FILE_BYTES = 100 * 1000 * 1000;

type Transfer = typeof everyAppTransfers.$inferSelect;
type RowsCommand = Extract<TransferCommand, { command: "rows" }>;
type ImportValue = RowsCommand["rows"][number][number];

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * A new transfer code, replacing any earlier one, or null while a move is
 * running: replacing its code would stop it partway.
 */
async function createTransferCode(input: { userId: string; origin: string }) {
  if (await isTransferRunning()) return null;
  const secret = randomSecret();
  const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS).toISOString();
  const secretHash = await sha256Hex(secret);
  await runBatch((tx) => [
    tx.delete(everyAppTransfers),
    tx
      .insert(everyAppTransfers)
      .values({ secretHash, createdByUserId: input.userId, expiresAt }),
  ]);
  return { code: formatTransferCode(input.origin, secret), expiresAt };
}

/** True while a self-hosted install has sent part of a move in the last hour. */
async function isTransferRunning() {
  const rows = await db
    .select({ secretHash: everyAppTransfers.secretHash })
    .from(everyAppTransfers)
    .where(
      gt(
        everyAppTransfers.activeAt,
        new Date(Date.now() - ACTIVE_MOVE_MS).toISOString(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function markActive(transfer: Transfer) {
  return db
    .update(everyAppTransfers)
    .set({ activeAt: new Date().toISOString() })
    .where(eq(everyAppTransfers.secretHash, transfer.secretHash));
}

async function findTransfer(authorization: string | null) {
  const secret = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!secret) return null;
  const [transfer] = await db
    .select()
    .from(everyAppTransfers)
    .where(
      and(
        eq(everyAppTransfers.secretHash, await sha256Hex(secret)),
        gt(everyAppTransfers.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);
  return transfer ?? null;
}

function refuse(problem: TransferProblem) {
  return Response.json(
    { problem },
    { status: problem === TransferProblem.CodeRejected ? 401 : 409 },
  );
}

function badRequest(message: string) {
  return new Response(message, { status: 400 });
}

// Each person in the self-hosted install becomes the Gateway member with the
// same email, or else the person who made the code.
async function begin(
  transfer: Transfer,
  command: Extract<TransferCommand, { command: "begin" }>,
) {
  if (command.schema !== SCHEMA_VERSION) {
    return refuse(TransferProblem.VersionMismatch);
  }
  const { members } = await listMembers({ env, for: gatewayCallFor() });
  const memberByEmail = new Map(
    members.map((member) => [member.email.toLowerCase(), member]),
  );
  const movedMembers = new Map<string, (typeof members)[number]>();
  const mappings = command.users.map((previous) => {
    const member = memberByEmail.get(previous.email.toLowerCase());
    if (member) movedMembers.set(member.id, member);
    return {
      secretHash: transfer.secretHash,
      previousUserId: previous.id,
      userId: member?.id ?? transfer.createdByUserId,
    };
  });
  await runBatch((tx) => [
    ...[...movedMembers.values()].map((member) =>
      tx
        .insert(user)
        .values({
          id: member.id,
          email: member.email,
          name: member.name || member.email.split("@")[0] || "OpenSEO",
          emailVerified: true,
        })
        .onConflictDoNothing(),
    ),
    ...mappings.map((mapping) =>
      tx.insert(everyAppTransferUsers).values(mapping).onConflictDoNothing(),
    ),
    tx
      .update(everyAppTransfers)
      .set({ activeAt: new Date().toISOString() })
      .where(eq(everyAppTransfers.secretHash, transfer.secretHash)),
  ]);
  return Response.json({ ok: true });
}

async function tableColumns(table: string) {
  const { results } = await env.DB.prepare(
    "SELECT name, type, pk FROM pragma_table_info(?)",
  )
    .bind(table)
    .all<{ name: string; type: string; pk: number }>();
  return results;
}

// An auto-numbered id is this install's to give: the moved one may already
// be taken here. Nothing references those rows, so a new id is safe.
function autoNumberedId(columns: { name: string; type: string; pk: number }[]) {
  const keys = columns.filter((column) => column.pk > 0);
  return keys.length === 1 && keys[0].type.toUpperCase() === "INTEGER"
    ? keys[0].name
    : null;
}

async function userIdsFor(transfer: Transfer) {
  const rows = await db
    .select()
    .from(everyAppTransferUsers)
    .where(eq(everyAppTransferUsers.secretHash, transfer.secretHash));
  return new Map(rows.map((row) => [row.previousUserId, row.userId]));
}

// Every project lands in this install's one workspace, and every person
// reference points at who they are here.
async function receiveRows(transfer: Transfer, command: RowsCommand) {
  // SQLite matches table names in any case: only the canonical lowercase
  // name may pass the exclusions.
  if (
    !/^[a-z][a-z0-9_]*$/.test(command.table) ||
    EXCLUDED_TABLES.has(command.table) ||
    command.table.startsWith("sqlite_")
  ) {
    return badRequest("Excluded table");
  }
  const columns = await tableColumns(command.table);
  if (
    columns.length === 0 ||
    command.columns.some(
      (name) => !columns.some((column) => column.name === name),
    ) ||
    command.rows.some((row) => row.length !== command.columns.length)
  ) {
    return badRequest("Schema mismatch");
  }
  const userIds = await userIdsFor(transfer);
  const mapValue = command.columns.map((column) => {
    if (column === "organization_id") {
      return () => SHARED_WORKSPACE_ORGANIZATION_ID;
    }
    if (column.endsWith("user_id")) {
      return (value: ImportValue) =>
        value === null
          ? null
          : (userIds.get(String(value)) ?? transfer.createdByUserId);
    }
    return (value: ImportValue) => value;
  });
  const isDefaultProject = (row: ImportValue[]) =>
    command.table === "projects" &&
    row[command.columns.indexOf("name")] === "Default" &&
    row[command.columns.indexOf("domain")] === null &&
    row[command.columns.indexOf("archived_at")] === null;
  const rows = command.rows.map((row) => {
    const mapped = row.map((value, index) => mapValue[index](value));
    if (isDefaultProject(mapped)) {
      mapped[command.columns.indexOf("name")] = MOVED_DEFAULT_PROJECT_NAME;
    }
    return mapped;
  });
  const skippedId = autoNumberedId(columns);
  const kept = command.columns.flatMap((name, index) =>
    name === skippedId ? [] : [{ name, index }],
  );
  const columnList = kept.map(({ name }) => `"${name}"`).join(",");
  const values = kept.map(() => "?").join(",");
  // Without its id, a moved row is matched on everything else, so moving
  // twice still adds it once.
  const insert = skippedId
    ? `INSERT INTO "${command.table}" (${columnList}) SELECT ${values} WHERE NOT EXISTS (SELECT 1 FROM "${command.table}" WHERE ${kept
        .map(({ name }) => `"${name}" IS ?`)
        .join(" AND ")}) ON CONFLICT DO NOTHING`
    : `INSERT INTO "${command.table}" (${columnList}) VALUES (${values}) ON CONFLICT DO NOTHING`;
  await runD1ImportBatch(
    rows.map((row) => {
      const keptValues = kept.map(({ index }) => row[index]);
      return env.DB.prepare(insert).bind(
        ...(skippedId ? [...keptValues, ...keptValues] : keptValues),
      );
    }),
  );
  return Response.json({ ok: true });
}

async function receiveChat(
  command: Extract<TransferCommand, { command: "chat" }>,
) {
  // Only a conversation that was moved here takes messages.
  const [session] = await db
    .select({ id: samSessions.id })
    .from(samSessions)
    .where(eq(samSessions.id, command.sessionId))
    .limit(1);
  if (!session) return badRequest("Unknown conversation");
  const validated = await safeValidateUIMessages({
    messages: command.messages,
  });
  if (!validated.success) return badRequest("Invalid messages");
  const namespace =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- env.d.ts declares the DO binding untyped; it is this class
    env.SAM_CHAT as unknown as DurableObjectNamespace<SamChatAgent>;
  const agent = await getAgentByName(namespace, command.sessionId);
  await agent.importTranscript(validated.data);
  return Response.json({ ok: true });
}

function fileTooLarge() {
  return new Response("File too large", { status: 413 });
}

async function receiveFile(key: string, request: Request) {
  if (!key || key.length > 1024) return badRequest("Invalid file key");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) {
    return fileTooLarge();
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_FILE_BYTES) return fileTooLarge();
  const metadata = fileMetadataSchema.parse(
    JSON.parse(request.headers.get(FILE_METADATA_HEADER) ?? "{}"),
  );
  const { cacheExpiry, ...httpMetadata } = metadata.httpMetadata ?? {};
  // A move adds files and never replaces one this install already has: the
  // put only happens while the key is absent, and is skipped otherwise.
  await env.R2.put(key, body, {
    onlyIf: new Headers({ "if-none-match": "*" }),
    customMetadata: metadata.customMetadata,
    httpMetadata: {
      ...httpMetadata,
      ...(cacheExpiry ? { cacheExpiry: new Date(cacheExpiry) } : {}),
    },
  });
  return Response.json({ ok: true });
}

// The last step: the code stops working.
async function finish(transfer: Transfer) {
  await db
    .delete(everyAppTransfers)
    .where(eq(everyAppTransfers.secretHash, transfer.secretHash));
  return Response.json({ ok: true });
}

/** The public route a self-hosted install sends a move to. */
async function handleTransferRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Not found", { status: 404 });
  }
  const transfer = await findTransfer(request.headers.get("authorization"));
  if (!transfer) return refuse(TransferProblem.CodeRejected);
  const fileKey = new URL(request.url).searchParams.get(FILE_KEY_PARAM);
  const parsed =
    fileKey === null
      ? transferCommandSchema.safeParse(await request.json())
      : null;
  if (parsed && !parsed.success) return badRequest("Invalid command");
  const command = parsed?.data;
  if (command?.command === "begin") return begin(transfer, command);
  if (!transfer.activeAt) return badRequest("Move not started");
  await markActive(transfer);
  if (fileKey !== null) return receiveFile(fileKey, request);
  switch (command?.command) {
    case "rows":
      return receiveRows(transfer, command);
    case "chat":
      return receiveChat(command);
    case "finish":
      return finish(transfer);
    default:
      return badRequest("Invalid command");
  }
}

export const EveryAppTransferReceiver = {
  createTransferCode,
  isTransferRunning,
  handleTransferRequest,
} as const;
