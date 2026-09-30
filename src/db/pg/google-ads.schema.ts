import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep this definition structurally identical to ../google-ads.schema.ts.
export const googleAdsConnections = pgTable(
  "google_ads_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    loginCustomerId: text("login_customer_id"),
    customerDescriptiveName: text("customer_descriptive_name"),
    currencyCode: text("currency_code"),
    timeZone: text("time_zone"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    googleAdsAccountId: text("google_ads_account_id").notNull(),
    connectedAccountEmail: text("connected_account_email"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("google_ads_connections_project_idx").on(table.projectId),
    index("google_ads_connections_organization_idx").on(table.organizationId),
    index("google_ads_connections_connector_idx").on(
      table.connectedByUserId,
      table.googleAdsAccountId,
    ),
  ],
);
