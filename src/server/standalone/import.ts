import { getAgentByName } from "agents";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { runD1ImportBatch } from "@/db/runBatch";
import { identifier, importRowsSchema } from "./import-schema";
import { isOperatorRequest } from "./operator-auth";
import type { StandaloneSamChatAgent } from "./SamChatAgent";
const requestSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("begin"),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ command: z.literal("rows"), ...importRowsSchema.shape }),
  z.object({
    command: z.literal("sam"),
    sessionId: z.string().min(1),
    ...importRowsSchema.shape,
  }),
  z.object({ command: z.literal("sam-counts"), sessionId: z.string().min(1) }),
  z.object({ command: z.literal("counts") }),
  z.object({ command: z.literal("finish") }),
]);
const excluded = new Set([
  "session",
  "verification",
  "apikey",
  "rate_limit",
  "d1_migrations",
]);
const marker = "standalone:legacy-import";

// While a legacy Docker import runs, nothing else may touch the database.
export async function isLegacyImportActive(): Promise<boolean> {
  const state = await env.KV.get(marker);
  return Boolean(state && !state.startsWith("complete:"));
}

export async function handleImport(request: Request): Promise<Response> {
  if (request.method !== "POST" || !isOperatorRequest(request.headers))
    return new Response("Not found", { status: 404 });
  if (new URL(request.url).searchParams.get("artifact")) {
    const state = await env.KV.get(marker);
    if (!state || state.startsWith("complete:"))
      return new Response("No active import", { status: 409 });
    const key = request.headers.get("x-artifact-key");
    if (!key) return new Response("Missing artifact key", { status: 400 });
    const metadata = z
      .object({
        httpMetadata: z.record(z.string(), z.string()).optional(),
        customMetadata: z.record(z.string(), z.string()).optional(),
      })
      .parse(JSON.parse(request.headers.get("x-artifact-metadata") ?? "{}"));
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 20 * 1024 * 1024)
      return new Response("Artifact exceeds 20 MiB", { status: 413 });
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (digest !== request.headers.get("x-artifact-sha256"))
      return new Response("Artifact checksum mismatch", { status: 400 });
    const { cacheExpiry, ...httpMetadata } = metadata.httpMetadata ?? {};
    await env.R2.put(decodeURIComponent(key), bytes, {
      customMetadata: metadata.customMetadata,
      httpMetadata: {
        ...httpMetadata,
        ...(cacheExpiry
          ? { cacheExpiry: z.coerce.date().parse(cacheExpiry) }
          : {}),
      },
    });
    return Response.json({ ok: true });
  }
  const input = requestSchema.parse(await request.json());
  const state = await env.KV.get(marker);
  if (input.command === "begin") {
    if (state === input.manifestHash) return Response.json({ resumed: true });
    if (
      state ||
      (await env.DB.prepare('SELECT id FROM "user" LIMIT 1').first()) ||
      (await env.DB.prepare("SELECT id FROM projects LIMIT 1").first())
    )
      return new Response("Import requires a fresh database", { status: 409 });
    await env.KV.put(marker, input.manifestHash);
    return Response.json({ ok: true });
  }
  if (!state || state.startsWith("complete:"))
    return new Response("No active import", { status: 409 });
  if (input.command === "finish") {
    await env.KV.put(marker, `complete:${state}`);
    return Response.json({ ok: true });
  }
  if (input.command === "sam" || input.command === "sam-counts") {
    const session = await env.DB.prepare(
      "SELECT id FROM sam_sessions WHERE id = ?",
    )
      .bind(input.sessionId)
      .first();
    if (!session) return new Response("Unknown conversation", { status: 400 });
    // env.d.ts declares the DO bindings untyped (ambient contexts can't import
    // the classes); narrow here so the import RPCs are typed.
    const namespace =
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the binding is declared as this class in wrangler.standalone.json
      env.SAM_CHAT as unknown as DurableObjectNamespace<StandaloneSamChatAgent>;
    const stub = await getAgentByName(namespace, input.sessionId);
    if (input.command === "sam-counts")
      return Response.json(await stub.legacyHistoryCounts());
    await stub.importLegacyHistory(input);
    return Response.json({ ok: true });
  }
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  ).all<{ name: string }>();
  if (input.command === "counts") {
    const counts: Record<string, number> = {};
    for (const { name } of tables.results) {
      if (!identifier.safeParse(name).success) continue;
      counts[name] =
        (await env.DB.prepare(
          `SELECT count(*) AS n FROM "${name}"`,
        ).first<number>("n")) ?? 0;
    }
    return Response.json(counts);
  }
  if (
    excluded.has(input.table) ||
    !tables.results.some((row) => row.name === input.table)
  )
    return new Response("Unknown or excluded table", { status: 400 });
  const columns = await env.DB.prepare(
    `PRAGMA table_info("${input.table}")`,
  ).all<{ name: string }>();
  if (
    input.columns.some(
      (name) => !columns.results.some((column) => column.name === name),
    ) ||
    input.rows.some((row) => row.length !== input.columns.length)
  )
    return new Response("Schema mismatch", { status: 400 });
  const insert = `INSERT INTO "${input.table}" (${input.columns.map((name) => `"${name}"`).join(",")}) VALUES (${input.columns.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`;
  await runD1ImportBatch(
    input.rows.map((row) => env.DB.prepare(insert).bind(...row)),
  );
  return Response.json({ ok: true });
}
