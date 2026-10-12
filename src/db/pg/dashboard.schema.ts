import { pgTable, text, bigint } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";

export const dataRefreshClaims = pgTable("data_refresh_claims", {
  key: text("key").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull(),
});
