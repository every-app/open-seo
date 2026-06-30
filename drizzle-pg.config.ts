import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/pg/schema.ts",
  out: "./drizzle-pg",
  dbCredentials: {
    url: process.env.POSTGRES_DATABASE_URL!,
  },
});
