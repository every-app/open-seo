import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Bing Webmaster Tools API keys per OpenSEO user. A user may store several —
// Bing issues one key per Bing account, so multiple accounts means multiple
// keys. Each key is encrypted at rest with BETTER_AUTH_SECRET and never leaves
// the server.
export const bingCredentials = sqliteTable(
  "bing_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    // Ciphertext (symmetricEncrypt). Never selected into a client response.
    apiKey: text("api_key").notNull(),
    // Last four characters, for the "which key is this" hint in the UI.
    keyLast4: text("key_last4").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("bing_credentials_user_idx").on(table.userId)],
);

// Connected Bing Webmaster site per project. Mirrors gsc_connections: the
// project/workspace owns the mapping, while the credential belongs to the
// member who connected it — an API key row (bing_credentials), or the member's
// delegated OAuth grant when credentialId is null.
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
    // Stored verbatim from GetUserSites; Bing matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    credentialId: text("credential_id").references(() => bingCredentials.id, {
      onDelete: "cascade",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected site per project in v1; switching replaces the row.
    uniqueIndex("bing_connections_project_idx").on(table.projectId),
    index("bing_connections_organization_idx").on(table.organizationId),
    index("bing_connections_credential_idx").on(table.credentialId),
  ],
);
