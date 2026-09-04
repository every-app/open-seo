import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Keep this definition structurally identical to ../cloudflare-analytics.schema.ts. */
export const cloudflareAnalyticsConnections = pgTable(
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
    trafficAvailable: boolean("traffic_available").notNull().default(false),
    trafficReason: text("traffic_reason"),
    securityEventsAvailable: boolean("security_events_available")
      .notNull()
      .default(false),
    securityEventsReason: text("security_events_reason"),
    crawlerAccessAvailable: boolean("crawler_access_available")
      .notNull()
      .default(false),
    crawlerAccessReason: text("crawler_access_reason"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
