import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep these definitions structurally identical to ../clarity.schema.ts.
export const clarityConnections = pgTable(
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
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("clarity_connections_project_idx").on(table.projectId),
    index("clarity_connections_organization_idx").on(table.organizationId),
  ],
);

export const clarityReportCache = pgTable(
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

export const clarityReportRefreshLeases = pgTable(
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
