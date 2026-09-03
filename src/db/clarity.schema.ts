import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// Microsoft Clarity uses a project-scoped Data Export API token instead of an
// OAuth grant. The token is encrypted before it reaches this table and is never
// returned to the browser or MCP clients.
export const clarityConnections = sqliteTable(
  "clarity_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    encryptedApiToken: text("encrypted_api_token").notNull(),
    tokenHint: text("token_hint").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("clarity_connections_project_idx").on(table.projectId),
    index("clarity_connections_organization_idx").on(table.organizationId),
  ],
);

// Clarity permits only ten Data Export calls per project per day. Cache each
// fixed report shape persistently so page loads, MCP clients, and SAM share the
// same quota budget across Worker isolates.
export const clarityReportCache = sqliteTable(
  "clarity_report_cache",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportKind: text("report_kind").notNull(),
    numOfDays: integer("num_of_days").notNull(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => clarityConnections.id, { onDelete: "cascade" }),
    responseJson: text("response_json").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("clarity_report_cache_report_idx").on(
      table.projectId,
      table.reportKind,
      table.numOfDays,
    ),
    index("clarity_report_cache_project_idx").on(table.projectId),
    index("clarity_report_cache_fetched_at_idx").on(table.fetchedAt),
  ],
);

// A short database-backed lease deduplicates cache misses across Worker
// isolates. Without it, a burst from the UI, MCP, and SAM could consume all ten
// daily Data Export requests before any one response reaches the shared cache.
export const clarityReportRefreshLeases = sqliteTable(
  "clarity_report_refresh_leases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportKind: text("report_kind").notNull(),
    numOfDays: integer("num_of_days").notNull(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => clarityConnections.id, { onDelete: "cascade" }),
    leaseId: text("lease_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    errorCode: text("error_code"),
  },
  (table) => [
    uniqueIndex("clarity_report_refresh_lease_report_idx").on(
      table.projectId,
      table.reportKind,
      table.numOfDays,
    ),
    index("clarity_report_refresh_lease_project_idx").on(table.projectId),
    index("clarity_report_refresh_lease_expires_at_idx").on(table.expiresAt),
  ],
);
