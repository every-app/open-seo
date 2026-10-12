import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";

export const dataRefreshClaims = sqliteTable("data_refresh_claims", {
  key: text("key").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  nextAttemptAt: integer("next_attempt_at").notNull(),
});
