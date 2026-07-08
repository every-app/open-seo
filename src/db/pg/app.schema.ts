import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth-schema";

// Timestamps are stored as *text* (same column shape as the SQLite schema).
// Postgres `timestamptz` would be parsed back into a JS Date by postgres-js
// (even with drizzle `mode:"string"`), silently breaking the lexicographic
// string comparisons the app does on timestamps. `isoNow` matches the format of
// `new Date().toISOString()`, so within a Postgres deployment DB-defaulted and
// app-written values sort together.
//
// NOTE: this is NOT byte-for-byte equal to the SQLite default, which uses
// `current_timestamp` (`YYYY-MM-DD HH:MM:SS`, space-separated, no millis/Z).
// Each backend is internally consistent, but a one-time D1→Postgres data
// migration MUST rewrite legacy timestamp text into this ISO format (tracked as
// the deferred timestamp backfill).
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const userOnboardingAnswers = pgTable(
  "user_onboarding_answers",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    interestedFeatures: text("interested_features").notNull().default("[]"),
    workFor: text("work_for"),
    clientWebsiteCount: text("client_website_count"),
    foundVia: text("found_via"),
    mcpSetupIntent: text("mcp_setup_intent"),
    completedAt: timestampColumn("completed_at"),
    // Set when the user dismisses (or acts on) the one-time "connect Search
    // Console" nudge shown to people who finished onboarding before the GSC
    // step existed. Null = never shown/dismissed.
    gscNudgeDismissedAt: timestampColumn("gsc_nudge_dismissed_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("user_onboarding_answers_organization_idx").on(table.organizationId),
  ],
);

// Projects for keyword research
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    // Default DataForSEO location/language for the project, set during
    // onboarding and reused by every project-scoped data call.
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    // Soft delete: archived projects are hidden everywhere but their data
    // (keywords, rank tracking, audits) is preserved.
    archivedAt: timestampColumn("archived_at"),
  },
  (table) => [
    // Only the auto-created Default/null-domain project is a singleton. This
    // guards the get-or-create race when several requests enter a new
    // organization at once (mirrors the SQLite schema). `tryCreateDefaultProject`
    // relies on this partial unique index for its onConflictDoNothing().
    uniqueIndex("projects_one_default_per_organization_idx")
      .on(table.organizationId)
      .where(
        sql`${table.name} = 'Default' AND ${table.domain} IS NULL AND ${table.archivedAt} IS NULL`,
      ),
    // Every project listing filters by organization; the partial-unique index
    // above only covers the Default-project row, so without this the org-scoped
    // list queries seq-scan. Per-org row counts are small, so the archived/
    // created_at ordering sorts cheaply on top of this single-column lookup.
    index("projects_organization_id_idx").on(table.organizationId),
  ],
);

// User-saved keywords within a project. This is the canonical saved list.
export const savedKeywords = pgTable(
  "saved_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
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

export const savedKeywordTags = pgTable(
  "saved_keyword_tags",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    // Palette key (e.g. "blue", "rose"). Null = derive a stable color from the
    // tag id at render time. See src/shared/tag-colors.ts.
    color: text("color"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("saved_keyword_tags_project_normalized_name_idx").on(
      table.projectId,
      table.normalizedName,
    ),
    index("saved_keyword_tags_project_name_idx").on(
      table.projectId,
      table.name,
    ),
  ],
);

export const savedKeywordTagAssignments = pgTable(
  "saved_keyword_tag_assignments",
  {
    savedKeywordId: text("saved_keyword_id")
      .notNull()
      .references(() => savedKeywords.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => savedKeywordTags.id, { onDelete: "cascade" }),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("saved_keyword_tag_assignments_unique_idx").on(
      table.savedKeywordId,
      table.tagId,
    ),
    // No standalone index on savedKeywordId — the unique index above has it as
    // its leftmost column, so it already serves savedKeywordId lookups.
    index("saved_keyword_tag_assignments_tag_idx").on(table.tagId),
  ],
);

// Latest cached metrics for a keyword within a project.
// This is joined onto savedKeywords when rendering the saved keyword list.
export const keywordMetrics = pgTable(
  "keyword_metrics",
  {
    id: serial("id").primaryKey(),
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
    fetchedAt: timestampColumn("fetched_at").notNull().default(isoNow),
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
export const rankTrackingConfigs = pgTable(
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
    serpDepth: integer("serp_depth").notNull(),
    scheduleInterval: text("schedule_interval", {
      enum: ["daily", "weekly", "monthly", "manual"],
    })
      .notNull()
      .default("weekly"),
    locationName: text("location_name"),
    isActive: boolean("is_active").notNull().default(true),
    lastCheckedAt: timestampColumn("last_checked_at"),
    nextCheckAt: timestampColumn("next_check_at"),
    lastSkipReason: text("last_skip_reason"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("rank_tracking_configs_national_idx")
      .on(table.projectId, table.domain, table.locationCode)
      .where(sql`${table.locationName} IS NULL`),
    uniqueIndex("rank_tracking_configs_local_idx")
      .on(table.projectId, table.domain, table.locationCode, table.locationName)
      .where(sql`${table.locationName} IS NOT NULL`),
  ],
);

// Keywords tracked per domain config
export const rankTrackingKeywords = pgTable(
  "rank_tracking_keywords",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => rankTrackingConfigs.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    searchVolume: integer("search_volume"),
    keywordDifficulty: integer("keyword_difficulty"),
    cpc: real("cpc"),
    metricsFetchedAt: timestampColumn("metrics_fetched_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("rank_tracking_keywords_config_keyword_idx").on(
      table.configId,
      table.keyword,
    ),
  ],
);

// One row per check execution (manual or scheduled).
// A partial unique index on `config_id WHERE status IN ('pending','running')`
// enforces at most one in-flight run per config at the DB level, which is how
// duplicate-trigger protection is implemented — INSERT of a second pending run
// for the same config fails with a unique-constraint violation.
export const rankCheckRuns = pgTable(
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
    isSubsetRun: boolean("is_subset_run").notNull().default(false),
    errorMessage: text("error_message"),
    startedAt: timestampColumn("started_at").notNull().default(isoNow),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    index("rank_check_runs_config_idx").on(table.configId, table.startedAt),
    index("rank_check_runs_project_idx").on(table.projectId, table.startedAt),
    uniqueIndex("rank_check_runs_one_active_per_config_idx")
      .on(table.configId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

// One row per keyword per device per check run
export const rankSnapshots = pgTable(
  "rank_snapshots",
  {
    id: serial("id").primaryKey(),
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
    checkedAt: timestampColumn("checked_at").notNull().default(isoNow),
  },
  (table) => [
    // No standalone index on runId — the unique index below has it as its
    // leftmost column, so it already serves runId lookups.
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
export const audits = pgTable(
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
    startedAt: timestampColumn("started_at").notNull().default(isoNow),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    index("audits_project_id_idx").on(table.projectId),
    index("audits_started_by_user_id_idx").on(table.startedByUserId),
  ],
);

// One row per crawled page
export const auditPages = pgTable(
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
    internalLinkCount: integer("internal_link_count").notNull().default(0),
    externalLinkCount: integer("external_link_count").notNull().default(0),
    hasStructuredData: boolean("has_structured_data").notNull().default(false),
    hreflangTagsJson: text("hreflang_tags_json"),
    isIndexable: boolean("is_indexable").notNull().default(true),
    responseTimeMs: integer("response_time_ms"),
  },
  (table) => [index("audit_pages_audit_id_idx").on(table.auditId)],
);

// One row per Lighthouse test (mobile + desktop per page).
export const auditLighthouseResults = pgTable(
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
