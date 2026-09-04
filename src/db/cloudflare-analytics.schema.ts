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

/** One read-only Cloudflare Analytics zone connection per OpenSEO project. */
export const cloudflareAnalyticsConnections = sqliteTable(
  "cloudflare_analytics_connections",
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
    zoneId: text("zone_id").notNull(),
    zoneLabel: text("zone_label"),
    trafficAvailable: integer("traffic_available", { mode: "boolean" })
      .notNull()
      .default(false),
    trafficReason: text("traffic_reason"),
    securityEventsAvailable: integer("security_events_available", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    securityEventsReason: text("security_events_reason"),
    crawlerAccessAvailable: integer("crawler_access_available", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    crawlerAccessReason: text("crawler_access_reason"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("cloudflare_analytics_connections_project_idx").on(
      table.projectId,
    ),
    index("cloudflare_analytics_connections_organization_idx").on(
      table.organizationId,
    ),
  ],
);
