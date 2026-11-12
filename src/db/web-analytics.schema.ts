import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

// First-party web analytics for a project's own site, opt-in per project. The
// ingestion model is ported from Minilytics (MIT, surendrapandar/minilytics):
// attribution (source/channel/geo/device) is classified once at session start
// and denormalized onto the session row, so every dashboard breakdown is a
// single-table GROUP BY. Timestamps are ISO 8601 UTC text written by the app
// (never column defaults), keeping lexical range comparisons exact on both
// backends.

// One row per project that has analytics enabled. `id` is the public site id
// the tracker script sends; it is deliberately not the project id.
export const webAnalyticsSites = sqliteTable(
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

export const webAnalyticsSessions = sqliteTable(
  "web_analytics_sessions",
  {
    siteId: text("site_id")
      .notNull()
      .references(() => webAnalyticsSites.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    visitorId: text("visitor_id").notNull(),
    startedAt: text("started_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    // Engaged time in ms, accumulated from tracker pings (visible tab only).
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

export const webAnalyticsEvents = sqliteTable(
  "web_analytics_events",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => webAnalyticsSites.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    ts: text("ts").notNull(),
    // "pageview" | "goal" | "outbound"
    type: text("type").notNull(),
    // Goal name or outbound target; null for pageviews.
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
