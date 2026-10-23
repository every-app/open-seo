import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// One Umami server login, shared by every project in the organization that
// reads a website from it. The secret (API key or password) and any custom
// request headers are encrypted, and never returned to the client.
// saved_by_user_id is whoever last entered the credentials: the person whose
// secret this row holds, which is what GDPR erasure removes.
export const umamiInstances = sqliteTable(
  "umami_instances",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Normalized origin plus optional path prefix, no trailing slash, e.g.
    // "https://analytics.example.com" or "https://api.umami.is/v1".
    baseUrl: text("base_url").notNull(),
    authType: text("auth_type", { enum: ["api_key", "password"] }).notNull(),
    // Set for password logins; null for API keys.
    username: text("username"),
    encryptedSecret: text("encrypted_secret").notNull(),
    // Encrypted JSON array of { name, value } pairs sent with every request,
    // for auth proxies in front of a self-hosted server. An opaque payload.
    encryptedHeaders: text("encrypted_headers"),
    savedByUserId: text("saved_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("umami_instances_organization_idx").on(table.organizationId),
  ],
);

// The Umami website a project reads its analytics from.
export const umamiConnections = sqliteTable(
  "umami_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    instanceId: text("instance_id")
      .notNull()
      .references(() => umamiInstances.id, { onDelete: "cascade" }),
    // Umami's website UUID.
    websiteId: text("website_id").notNull(),
    websiteName: text("website_name").notNull(),
    websiteDomain: text("website_domain"),
    // IANA zone used for day boundaries. Umami websites carry none, so the
    // browser's zone is captured when the website is picked.
    timeZone: text("time_zone").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("umami_connections_project_idx").on(table.projectId),
    index("umami_connections_organization_idx").on(table.organizationId),
    index("umami_connections_instance_idx").on(table.instanceId),
  ],
);
