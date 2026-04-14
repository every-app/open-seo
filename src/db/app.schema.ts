import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";

// This stores users for Cloudflare Access and local_noauth mode
// since they don't map to better-auth's user schema
export const delegatedUsers = sqliteTable("delegated_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Projects for keyword research
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// User-saved keywords within a project. This is the canonical saved list.
export const savedKeywords = sqliteTable(
  "saved_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("saved_keywords_unique_project_keyword_location_language").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
    ),
    index("saved_keywords_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// Latest cached metrics for a keyword within a project.
// This is joined onto savedKeywords when rendering the saved keyword list.
export const keywordMetrics = sqliteTable(
  "keyword_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    searchVolume: integer("search_volume"),
    cpc: real("cpc"),
    competition: real("competition"),
    keywordDifficulty: integer("keyword_difficulty"),
    intent: text("intent"),
    monthlySearches: text("monthly_searches"),
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("keyword_metrics_unique_project_keyword_location_language").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
    ),
    index("keyword_metrics_lookup_idx").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
      table.fetchedAt,
    ),
  ],
);

// ============================================================================
// Rank Tracking tables
// ============================================================================

// One configuration per project+domain — defines what domain to track and how
export const rankTrackingConfigs = sqliteTable(
  "rank_tracking_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    devices: text("devices", {
      enum: ["both", "desktop", "mobile"],
    })
      .notNull()
      .default("both"),
    scheduleInterval: text("schedule_interval", {
      enum: ["daily", "weekly", "manual"],
    })
      .notNull()
      .default("weekly"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    nextCheckAt: text("next_check_at"),
    lastSkipReason: text("last_skip_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("rank_tracking_configs_project_domain_location_idx").on(
      table.projectId,
      table.domain,
      table.locationCode,
    ),
  ],
);

// Keywords tracked per domain config
export const rankTrackingKeywords = sqliteTable(
  "rank_tracking_keywords",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("rank_tracking_keywords_config_keyword_idx").on(
      table.configId,
      table.keyword,
    ),
  ],
);

// One row per check execution (manual or scheduled)
export const rankCheckRuns = sqliteTable(
  "rank_check_runs",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    keywordsTotal: integer("keywords_total").notNull().default(0),
    keywordsChecked: integer("keywords_checked").notNull().default(0),
    isSubsetRun: integer("is_subset_run", { mode: "boolean" })
      .notNull()
      .default(false),
    errorMessage: text("error_message"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("rank_check_runs_config_idx").on(table.configId, table.startedAt),
    index("rank_check_runs_project_idx").on(table.projectId, table.startedAt),
  ],
);

// One active lock per rank tracking config to prevent overlapping runs
export const rankCheckLocks = sqliteTable(
  "rank_check_locks",
  {
    configId: text("config_id")
      .primaryKey()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    acquiredAt: text("acquired_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("rank_check_locks_run_idx").on(table.runId)],
);

// One row per keyword per device per check run
export const rankSnapshots = sqliteTable(
  "rank_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => rankCheckRuns.id, { onDelete: "cascade" }),
    // No FK to rankTrackingKeywords — intentional. Historical snapshots are
    // preserved after a keyword is removed from tracking so users can still
    // see past position data for deleted keywords.
    trackingKeywordId: text("tracking_keyword_id").notNull(),
    keyword: text("keyword").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    position: integer("position"), // null = not found in top 20
    url: text("url"),
    serpFeatures: text("serp_features"), // JSON array of feature type strings
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("rank_snapshots_run_idx").on(table.runId),
    index("rank_snapshots_keyword_device_idx").on(
      table.trackingKeywordId,
      table.device,
      table.checkedAt,
    ),
    uniqueIndex("rank_snapshots_run_keyword_device_idx").on(
      table.runId,
      table.trackingKeywordId,
      table.device,
    ),
  ],
);

// ============================================================================
// Site Audit tables
// ============================================================================

// One row per audit run
export const audits = sqliteTable(
  "audits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startedByUserId: text("started_by_user_id").notNull(),
    startUrl: text("start_url").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    workflowInstanceId: text("workflow_instance_id"),
    // JSON config: { maxPages, lighthouseStrategy }
    config: text("config").notNull().default("{}"),
    // Progress & summary
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    pagesTotal: integer("pages_total").notNull().default(0),
    lighthouseTotal: integer("lighthouse_total").notNull().default(0),
    lighthouseCompleted: integer("lighthouse_completed").notNull().default(0),
    lighthouseFailed: integer("lighthouse_failed").notNull().default(0),
    currentPhase: text("current_phase").default("discovery"),
    startedAt: text("started_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("audits_project_id_idx").on(table.projectId),
    index("audits_started_by_user_id_idx").on(table.startedByUserId),
  ],
);

// One row per crawled page
export const auditPages = sqliteTable(
  "audit_pages",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    redirectUrl: text("redirect_url"),
    // Metadata
    title: text("title"),
    metaDescription: text("meta_description"),
    canonicalUrl: text("canonical_url"),
    robotsMeta: text("robots_meta"),
    // Open Graph
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImage: text("og_image"),
    // Headings
    h1Count: integer("h1_count").notNull().default(0),
    h2Count: integer("h2_count").notNull().default(0),
    h3Count: integer("h3_count").notNull().default(0),
    h4Count: integer("h4_count").notNull().default(0),
    h5Count: integer("h5_count").notNull().default(0),
    h6Count: integer("h6_count").notNull().default(0),
    headingOrderJson: text("heading_order_json"),
    // Content
    wordCount: integer("word_count").notNull().default(0),
    // Images
    imagesTotal: integer("images_total").notNull().default(0),
    imagesMissingAlt: integer("images_missing_alt").notNull().default(0),
    imagesJson: text("images_json"),
    // Links
    internalLinkCount: integer("internal_link_count").notNull().default(0),
    externalLinkCount: integer("external_link_count").notNull().default(0),
    // Structured data
    hasStructuredData: integer("has_structured_data", { mode: "boolean" })
      .notNull()
      .default(false),
    // Hreflang
    hreflangTagsJson: text("hreflang_tags_json"),
    // Indexability
    isIndexable: integer("is_indexable", { mode: "boolean" })
      .notNull()
      .default(true),
    // Performance
    responseTimeMs: integer("response_time_ms"),
  },
  (table) => [index("audit_pages_audit_id_idx").on(table.auditId)],
);

// One row per Lighthouse test (mobile + desktop per page).
export const auditLighthouseResults = sqliteTable(
  "audit_lighthouse_results",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => auditPages.id, { onDelete: "cascade" }),
    strategy: text("strategy", { enum: ["mobile", "desktop"] }).notNull(),
    performanceScore: integer("performance_score"),
    accessibilityScore: integer("accessibility_score"),
    bestPracticesScore: integer("best_practices_score"),
    seoScore: integer("seo_score"),
    lcpMs: real("lcp_ms"),
    cls: real("cls"),
    inpMs: real("inp_ms"),
    ttfbMs: real("ttfb_ms"),
    errorMessage: text("error_message"),
    r2Key: text("r2_key"),
    payloadSizeBytes: integer("payload_size_bytes"),
  },
  (table) => [index("audit_lighthouse_results_audit_id_idx").on(table.auditId)],
);
