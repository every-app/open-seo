import { defineConfig } from "drizzle-kit";
import { getLocalD1Url } from "@every-app/sdk/cloudflare/server";

const localUrl = getLocalD1Url();

export default defineConfig({
  dialect: "sqlite",
  // The raw SQLite barrel (not ../schema, the provider-aware one, which imports
  // cloudflare:workers and can't load under drizzle-kit's node runtime).
  schema: "./src/db/d1/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: localUrl || "", // Empty fallback for CI/non-dev environments
  },
});
