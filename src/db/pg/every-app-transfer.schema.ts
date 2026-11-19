import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./better-auth-schema";

// Postgres mirror of the Every App transfer tables. Column notes: see
// ../every-app-transfer.schema.ts.
export const everyAppTransfers = pgTable("every_app_transfers", {
  secretHash: text("secret_hash").primaryKey(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  activeAt: text("active_at"),
});

export const everyAppTransferUsers = pgTable(
  "every_app_transfer_users",
  {
    secretHash: text("secret_hash")
      .notNull()
      .references(() => everyAppTransfers.secretHash, { onDelete: "cascade" }),
    previousUserId: text("previous_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.secretHash, table.previousUserId] }),
  ],
);
