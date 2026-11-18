import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";
import { user } from "./better-auth-schema";

// ============================================================================
// Embed links: a project's live, read-only widgets for other dashboards, such
// as a GoHighLevel custom menu link or dashboard Embed widget. One link per
// project; turning it off deletes the row, and turning it on again mints a new
// token, so an old link never comes back.
// ============================================================================

export const projectEmbeds = sqliteTable(
  "project_embeds",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    // The capability itself: 192 random bits as base64url, looked up as-is by
    // the public routes.
    token: text("token").notNull(),
    // The link reads data as this member. Erasing them deletes the link, and
    // the public routes stop answering once they leave the organization.
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [uniqueIndex("project_embeds_token_idx").on(table.token)],
);
