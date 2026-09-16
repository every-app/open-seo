import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Bing Webmaster Tools property per project. Unlike GSC/GA4 there is
// no OAuth grant to point at — the API key that authorizes every call lives in
// bingApiKeys, keyed by user, and this row just records which of that user's
// verified sites maps to this project.
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
    // Stored verbatim from GetUserSites — never normalize.
    siteUrl: text("site_url").notNull(),
    // Whose bingApiKeys row getBingWebmasterClient should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected property per project in v1; switching replaces the row.
    uniqueIndex("bing_connections_project_idx").on(table.projectId),
    index("bing_connections_organization_idx").on(table.organizationId),
  ],
);

// A user's Bing Webmaster API key (bing.com/webmasters -> Settings -> API
// Access -> Generate API Key). One key per user, covering every site verified
// on their Bing account — this mirrors Bing's own model, not a per-site key.
// `encryptedApiKey` is AES-256-GCM via bingCrypto.ts, keyed from
// BETTER_AUTH_SECRET the same way Better Auth encrypts stored OAuth tokens.
export const bingApiKeys = sqliteTable(
  "bing_api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [uniqueIndex("bing_api_keys_user_idx").on(table.userId)],
);
