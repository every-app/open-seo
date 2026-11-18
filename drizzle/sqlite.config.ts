import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

// The local D1 database `pnpm dev` serves, for drizzle-kit commands that open
// it (studio). Miniflare keeps it as a SQLite file under .wrangler/state, so
// it exists once the dev server or `pnpm db:migrate:local` has run. CI and
// `drizzle-kit generate` don't need it.
function localD1Url(): string {
  const dir = path.resolve(".wrangler/state/v3/d1");
  const file = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { encoding: "utf8", recursive: true })
        .find((name) => name.endsWith(".sqlite"))
    : undefined;
  if (!file) {
    console.warn(
      "No local D1 database yet: run `pnpm dev` or `pnpm db:migrate:local` once to create it.",
    );
    return "";
  }
  return path.join(dir, file);
}

export default defineConfig({
  dialect: "sqlite",
  // The raw SQLite barrel (not ../schema, the provider-aware one, which imports
  // cloudflare:workers and can't load under drizzle-kit's node runtime).
  schema: "./src/db/d1/schema.ts",
  out: "./drizzle/sqlite",
  dbCredentials: {
    url: localD1Url(),
  },
});
