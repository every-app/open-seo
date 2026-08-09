import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Google Analytics (GA4) property per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-analytics"; this row only records which property maps to a project
// and whose grant to use when calling the Analytics APIs.
export const ga4Connections = sqliteTable(
  "ga4_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from accountSummaries.list — "properties/123456789".
    // Never normalize; the Data API matches it byte-for-byte in the report path.
    propertyId: text("property_id").notNull(),
    // Human-readable label from accountSummaries.list, shown in the UI —
    // GA4 properties have no URL-shaped identifier the way GSC sites do.
    propertyDisplayName: text("property_display_name"),
    // Whose google-analytics grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    ga4AccountId: text("ga4_account_id"),
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
    uniqueIndex("ga4_connections_project_idx").on(table.projectId),
    index("ga4_connections_organization_idx").on(table.organizationId),
  ],
);
