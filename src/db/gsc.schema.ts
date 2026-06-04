import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Google Search Console property per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-search-console"; this row only records which verified property maps
// to a project and whose grant to use when calling the GSC API.
export const gscConnections = sqliteTable(
  "gsc_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from sites.list — "sc-domain:example.com" or
    // "https://example.com/". Never normalize; GSC matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    // Whose google-search-console grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected property per project in v1; switching replaces the row.
    uniqueIndex("gsc_connections_project_idx").on(table.projectId),
    index("gsc_connections_organization_idx").on(table.organizationId),
  ],
);
