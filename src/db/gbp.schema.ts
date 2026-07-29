import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Google Business Profile location per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "google-business-profile"; this row only records which verified location
// maps to a project and whose grant to use when calling the Business Profile
// APIs.
export const gbpConnections = sqliteTable(
  "gbp_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Resource name from locations.list, e.g. "locations/12345678901234567890".
    // Never normalize; the Business Information API matches it verbatim.
    locationName: text("location_name").notNull(),
    // Whose google-business-profile grant getAccessToken should use.
    connectedByUserId: text("connected_by_user_id").notNull(),
    gbpAccountId: text("gbp_account_id"),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected location per project in v1; switching replaces the row.
    uniqueIndex("gbp_connections_project_idx").on(table.projectId),
    index("gbp_connections_organization_idx").on(table.organizationId),
  ],
);
