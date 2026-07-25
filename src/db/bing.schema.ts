import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Bing Webmaster Tools site per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "bing-webmaster"; this row only
// records which verified site maps to a project and whose grant to use when
// calling the Bing Webmaster API.
export const bingConnections = sqliteTable(
  "bing_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from GetUserSites — e.g. "https://example.com/".
    // Never normalize; Bing matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    // Whose bing-webmaster grant should be used when calling the API.
    connectedByUserId: text("connected_by_user_id").notNull(),
    // Bing's `webmasteruid`, the stable per-account identifier.
    bingAccountId: text("bing_account_id"),
    connectedAccountEmail: text("connected_account_email"),
    // Always "oauth" today; "api_key" is reserved for the deferred
    // self-hosted lane (see specs/0009).
    authMode: text("auth_mode").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected site per project; switching replaces the row.
    uniqueIndex("bing_connections_project_idx").on(table.projectId),
    index("bing_connections_organization_idx").on(table.organizationId),
  ],
);
