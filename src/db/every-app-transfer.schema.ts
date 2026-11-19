import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth-schema";

// ============================================================================
// Moving a self-hosted OpenSEO into OpenSEO on an Every App Gateway. An owner
// or admin of the Gateway install makes a transfer code; the self-hosted
// install sends its data here with it. One row per code: making a new code
// replaces it, and the last step of a move deletes it.
// ============================================================================

export const everyAppTransfers = sqliteTable("every_app_transfers", {
  // SHA-256 of the code's secret, hex. The secret itself is never stored.
  secretHash: text("secret_hash").primaryKey(),
  // Whoever made the code. Moved work by people who aren't Gateway members
  // is credited to them.
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  // When the self-hosted install last sent part of a move; unset until it
  // starts.
  activeAt: text("active_at"),
});

// The self-hosted install's user ids and who they are here: the Gateway
// member with the same email, else the code's maker.
export const everyAppTransferUsers = sqliteTable(
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
