// Run from this checkout against a STOPPED copy of the old Docker volume.
// Miniflare is a development-only reader for its own storage format. It never
// enters the new runtime image. The input snapshot is copied before opening it.
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(
  require.resolve("miniflare", {
    paths: [dirname(require.resolve("wrangler"))],
  }),
);
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw new Error(
    "Usage: node scripts/celld/export-legacy.mjs COPIED_STATE_V3 OUTPUT_DIRECTORY",
  );
const output = resolve(destination);
await mkdir(output, { mode: 0o700 });
const scratch = await mkdtemp(join(tmpdir(), "openseo-export-"));
const manifest = {
  format: 1,
  source: "OpenSEO Miniflare state/v3",
  createdAt: new Date().toISOString(),
  tables: [],
  sam: [],
  artifacts: [],
  omitted: [
    "sessions, API keys, OAuth grants and verification tokens",
    "Google connections (reconnect after import)",
    "provider caches, billing and telemetry state",
    "running workflows, crawl scratchpads and pending SAM turns",
  ],
};
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let mf;
try {
  await cp(resolve(source), scratch, { recursive: true });
  // Miniflare 5 (wrangler 4.149+) replaced the options format; the converter
  // accepts the old one. resourcePersistencePath is the state/v3 directory,
  // with d1/, r2/ and do/ beneath it.
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "open-seo",
      modules: true,
      compatibilityDate: "2025-09-02",
      script: `import { DurableObject } from 'cloudflare:workers';
    export class SamChatAgent extends DurableObject {
      tables() { return this.ctx.storage.sql.exec("SELECT name FROM sqlite_schema WHERE type='table'").toArray().map(r=>r.name).filter(n=>['assistant_messages','assistant_compactions','assistant_config','assistant_fts'].includes(n)); }
      columns(table) { if(!this.tables().includes(table)) throw new Error('Unknown table'); return this.ctx.storage.sql.exec('PRAGMA table_info("'+table+'")').toArray().map(r=>r.name); }
      rows(table,offset) { if(!this.tables().includes(table)) throw new Error('Unknown table'); return this.ctx.storage.sql.exec('SELECT * FROM "'+table+'" LIMIT 50 OFFSET ?',offset).toArray(); }
    }
    export default { fetch() { return new Response('Offline export reader'); } };`,
      d1Databases: {
        DB: process.env.LEGACY_D1_ID ?? "37bee90a-e1aa-404f-b01e-b0d1d479bda1",
      },
      r2Buckets: { R2: "open-seo" },
      durableObjects: {
        SAM_CHAT: {
          className: "SamChatAgent",
          useSQLite: true,
          unsafeUniqueKey: "open-seo-SamChatAgent",
        },
      },
      resourcePersistencePath: scratch,
    }),
  );
  const db = await mf.getD1Database("DB");
  const all = (
    await db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all()
  ).results.map((r) => r.name);
  if (!all.includes("projects") || !all.includes("user"))
    throw new Error(
      "OpenSEO database not found. Check state/v3 path and LEGACY_D1_ID.",
    );
  for (const table of ["audits", "rank_check_runs"])
    if (all.includes(table)) {
      const row = await db
        .prepare(
          `SELECT count(*) AS n FROM ${quote(table)} WHERE status IN ('pending','running','queued')`,
        )
        .first();
      if (row.n)
        throw new Error(
          `Finish or cancel active ${table} in the old installation before exporting`,
        );
    }
  const excluded = new Set([
    "session",
    "verification",
    "apikey",
    "rate_limit",
    "d1_migrations",
    "gsc_connections",
    "ga4_connections",
    "billing_customer_status",
    "telemetry_state",
  ]);
  const pending = new Set(all.filter((n) => !excluded.has(n)));
  const ordered = [];
  while (pending.size) {
    let progressed = false;
    for (const table of pending) {
      const deps = (
        await db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all()
      ).results
        .map((r) => r.table)
        .filter((n) => n !== table);
      if (deps.some((n) => pending.has(n))) continue;
      pending.delete(table);
      ordered.push(table);
      progressed = true;
    }
    if (!progressed)
      throw new Error(
        `Unsupported cyclic database dependencies: ${[...pending].join(", ")}`,
      );
  }
  async function saveRows(collection, descriptor, columns, rows) {
    const serialized = JSON.stringify({
      table: descriptor.table,
      columns,
      rows: rows.map((row) => columns.map((column) => row[column])),
    });
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024)
      throw new Error("Export batch exceeds 8 MiB; reduce batch size");
    const filename = `rows-${manifest.tables.length + manifest.sam.length}.json`;
    await writeFile(join(output, filename), serialized, { mode: 0o600 });
    collection.push({
      ...descriptor,
      file: filename,
      sha256: sha(serialized),
      count: rows.length,
    });
  }
  for (const table of ordered) {
    const columns = (
      await db.prepare(`PRAGMA table_info(${quote(table)})`).all()
    ).results.map((r) => r.name);
    for (let offset = 0; ; offset += 50) {
      const filter =
        table === "account" ? " WHERE provider_id = 'credential'" : "";
      const rows = (
        await db
          .prepare(`SELECT * FROM ${quote(table)}${filter} LIMIT 50 OFFSET ?`)
          .bind(offset)
          .all()
      ).results;
      if (!rows.length) break;
      await saveRows(manifest.tables, { table }, columns, rows);
    }
  }
  const namespace = await mf.getDurableObjectNamespace("SAM_CHAT");
  if (all.includes("sam_sessions"))
    for (const { id } of (await db.prepare("SELECT id FROM sam_sessions").all())
      .results) {
      const stub = namespace.get(namespace.idFromName(id));
      const tables = await stub.tables();
      for (const table of tables) {
        const columns = await stub.columns(table);
        for (let offset = 0; ; offset += 50) {
          const rows = await stub.rows(table, offset);
          if (!rows.length) break;
          await saveRows(manifest.sam, { table, sessionId: id }, columns, rows);
        }
      }
    }
  const bucket = await mf.getR2Bucket("R2");
  let cursor;
  do {
    const listed = await bucket.list({ cursor });
    for (const item of listed.objects) {
      const object = await bucket.get(item.key);
      if (!object)
        throw new Error("Artifact disappeared from offline snapshot");
      if (object.size > 20 * 1024 * 1024)
        throw new Error(
          `Artifact ${item.key} exceeds the supported 20 MiB import size`,
        );
      const bytes = Buffer.from(await object.arrayBuffer());
      const file = `artifact-${manifest.artifacts.length}.bin`;
      await writeFile(join(output, file), bytes, { mode: 0o600 });
      manifest.artifacts.push({
        key: item.key,
        file,
        sha256: sha(bytes),
        size: bytes.length,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  await writeFile(
    join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Export complete: ${manifest.tables.reduce((n, t) => n + t.count, 0)} database rows, ${manifest.sam.reduce((n, t) => n + t.count, 0)} conversation rows, ${manifest.artifacts.length} artifacts. Review manifest omissions before importing.`,
  );
} finally {
  await mf?.dispose();
  await rm(scratch, { recursive: true, force: true });
}
