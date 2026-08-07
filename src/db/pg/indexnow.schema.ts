import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const indexnowConfigs = pgTable(
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
    enabled: boolean("enabled").notNull().default(true),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("indexnow_configs_project_idx").on(table.projectId),
    index("indexnow_configs_organization_idx").on(table.organizationId),
  ],
);

export const indexingEvents = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("indexing_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("indexing_events_organization_idx").on(table.organizationId),
  ],
);
