import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/cli-utils";

// Pull POSTGRES_DATABASE_URL from .env.local (no-op if already in the shell env),
// so the migration runbooks' single .env.local works for `db:migrate:pg` too.
loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/pg/schema.ts",
  out: "./drizzle-pg",
  dbCredentials: {
    url: process.env.POSTGRES_DATABASE_URL!,
  },
});
