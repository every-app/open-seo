import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// Keep this definition structurally identical to ../web-analytics.schema.ts.
// Timestamps are ISO 8601 UTC text written explicitly by the app, so there is
// no isoNow default here; see the SQLite file for the model's rationale.

export const webAnalyticsSites = pgTable(
  "web_analytics_sites",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("web_analytics_sites_project_idx").on(table.projectId),
    index("web_analytics_sites_organization_idx").on(table.organizationId),
  ],
);

export const webAnalyticsSessions = pgTable(
  "web_analytics_sessions",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => webAnalyticsSites.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    visitorId: text("visitor_id").notNull(),
    startedAt: text("started_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    pageviews: integer("pageviews").notNull().default(0),
    goals: integer("goals").notNull().default(0),
    hostname: text("hostname"),
    entryPage: text("entry_page"),
    exitPage: text("exit_page"),
    referrer: text("referrer"),
    referrerDomain: text("referrer_domain"),
    source: text("source").notNull(),
    channel: text("channel").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    ref: text("ref"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
  },
  (table) => [
    index("web_analytics_sessions_site_started_idx").on(
      table.siteId,
      table.startedAt,
    ),
    index("web_analytics_sessions_site_visitor_idx").on(
      table.siteId,
      table.visitorId,
    ),
  ],
);

export const webAnalyticsEvents = pgTable(
  "web_analytics_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => webAnalyticsSites.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    ts: text("ts").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    path: text("path"),
    props: text("props"),
  },
  (table) => [
    index("web_analytics_events_site_ts_idx").on(table.siteId, table.ts),
    index("web_analytics_events_site_session_idx").on(
      table.siteId,
      table.sessionId,
    ),
  ],
);
