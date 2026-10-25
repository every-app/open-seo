import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep these definitions structurally identical to ../umami.schema.ts.
export const umamiInstances = pgTable(
  "umami_instances",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    baseUrl: text("base_url").notNull(),
    authType: text("auth_type", { enum: ["api_key", "password"] }).notNull(),
    username: text("username"),
    encryptedSecret: text("encrypted_secret").notNull(),
    encryptedHeaders: text("encrypted_headers"),
    savedByUserId: text("saved_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("umami_instances_organization_idx").on(table.organizationId),
  ],
);

export const umamiConnections = pgTable(
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
    websiteId: text("website_id").notNull(),
    websiteName: text("website_name").notNull(),
    websiteDomain: text("website_domain"),
    timeZone: text("time_zone").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("umami_connections_project_idx").on(table.projectId),
    index("umami_connections_organization_idx").on(table.organizationId),
    index("umami_connections_instance_idx").on(table.instanceId),
  ],
);
