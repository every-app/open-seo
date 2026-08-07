import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

export const indexnowConfigs = sqliteTable(
  "indexnow_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    key: text("key").notNull(),
    keyLocation: text("key_location").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("indexnow_configs_project_idx").on(table.projectId),
    index("indexnow_configs_organization_idx").on(table.organizationId),
  ],
);

export const indexingEvents = sqliteTable(
  "indexing_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    eventType: text("event_type", {
      enum: ["submitted", "verified", "failed", "expired"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "success", "error"],
    }).notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("indexing_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("indexing_events_organization_idx").on(table.organizationId),
  ],
);
