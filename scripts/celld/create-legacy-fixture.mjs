import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { mkdir, readFile, readdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(
  require.resolve("miniflare", {
    paths: [dirname(require.resolve("wrangler"))],
  }),
);
const directory = resolve(process.argv[2] ?? "/tmp/openseo-legacy-fixture");
await mkdir(directory, { mode: 0o700 });
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "open-seo",
    modules: true,
    compatibilityDate: "2025-09-02",
    script: `import {DurableObject} from 'cloudflare:workers';
 export class SamChatAgent extends DurableObject {
  seed() {
   this.ctx.storage.sql.exec("CREATE TABLE assistant_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL DEFAULT '', parent_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
   this.ctx.storage.sql.exec("INSERT INTO assistant_messages(id, role, content) VALUES (?, ?, ?)",'legacy-message','user',JSON.stringify({id:'legacy-message',role:'user',parts:[{type:'text',text:'Preserved migration conversation'}]}));
  }
 }
 export default {fetch(){return new Response('fixture')}};`,
    d1Databases: { DB: "37bee90a-e1aa-404f-b01e-b0d1d479bda1" },
    r2Buckets: { R2: "open-seo" },
    durableObjects: {
      SAM_CHAT: {
        className: "SamChatAgent",
        useSQLite: true,
        unsafeUniqueKey: "open-seo-SamChatAgent",
      },
    },
    resourcePersistencePath: directory,
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("drizzle/sqlite"))
    .filter((n) => n.endsWith(".sql") && !n.startsWith("0048"))
    .sort()) {
    const sql = await readFile(join("drizzle/sqlite", name), "utf8");
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  await db
    .prepare(
      "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      "local-admin",
      "Legacy Admin",
      "admin@localhost",
      1,
      Date.now(),
      Date.now(),
    )
    .run();
  await db
    .prepare(
      "INSERT INTO organization (id,name,slug,created_at) VALUES (?,?,?,?)",
    )
    .bind(
      "delegated-local-admin",
      "Legacy workspace",
      "legacy-workspace",
      Date.now(),
    )
    .run();
  await db
    .prepare(
      "INSERT INTO projects (id,organization_id,name,domain) VALUES (?,?,?,?)",
    )
    .bind(
      "legacy-project",
      "delegated-local-admin",
      "Legacy project",
      "example.com",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO sam_sessions (id,project_id,user_id,title) VALUES (?,?,?,?)",
    )
    .bind("legacy-session", "legacy-project", "local-admin", "Preserved chat")
    .run();
  const namespace = await mf.getDurableObjectNamespace("SAM_CHAT");
  await namespace.get(namespace.idFromName("legacy-session")).seed();
  const bucket = await mf.getR2Bucket("R2");
  await bucket.put("fixture/report.html", "<h1>Preserved report</h1>", {
    httpMetadata: { contentType: "text/html" },
    customMetadata: { fixture: "yes" },
  });
  console.log(`Legacy fixture ready at ${directory}`);
} finally {
  await mf.dispose();
}
