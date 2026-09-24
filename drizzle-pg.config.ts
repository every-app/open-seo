import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/cli-utils";

// Pull the connection string from .env.local (no-op if already in the shell
// env), so the migration runbooks' single .env.local works for `db:migrate:pg`
// too. POSTGRES_DATABASE_URL wins so migrations can target Supabase's direct
// (session) connection while the app runs through DATABASE_URL (the
// transaction pooler, which cannot run migrations). See docs/DATABASE_SUPABASE.md.
loadLocalEnv();

// `db:generate:pg` needs no database; only `db:migrate:pg` connects, and it
// fails with drizzle-kit's own error when the URL is empty.
const migrationUrl =
  process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL || "";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/pg/schema.ts",
  out: "./drizzle-pg",
  dbCredentials: {
    url: migrationUrl,
  },
});
