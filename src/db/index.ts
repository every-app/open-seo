import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "./schema";

// Helper function to get the database instance from D1 binding
export const db = drizzle(env.DB, { schema });
