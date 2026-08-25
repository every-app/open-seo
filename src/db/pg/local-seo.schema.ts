import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const localBusinesses = pgTable(
  "local_businesses",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    placeId: text("place_id"),
    cid: text("cid"),
    featureId: text("feature_id"),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    website: text("website"),
    primaryCategory: text("primary_category"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    lastRefreshedAt: timestampColumn("last_refreshed_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("local_businesses_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    uniqueIndex("local_businesses_project_place_id_idx")
      .on(table.projectId, table.placeId)
      .where(sql`${table.placeId} IS NOT NULL`),
    uniqueIndex("local_businesses_project_cid_idx")
      .on(table.projectId, table.cid)
      .where(sql`${table.cid} IS NOT NULL`),
  ],
);

export const localGridConfigs = pgTable(
  "local_grid_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => localBusinesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    centerLatitude: real("center_latitude").notNull(),
    centerLongitude: real("center_longitude").notNull(),
    gridSize: integer("grid_size").notNull().default(7),
    radiusMeters: integer("radius_meters").notNull().default(4828),
    distanceUnit: text("distance_unit", { enum: ["km", "mi"] })
      .notNull()
      .default("mi"),
    languageCode: text("language_code").notNull().default("en"),
    seDomain: text("se_domain").notNull().default("google.co.uk"),
    searchDepth: integer("search_depth").notNull().default(20),
    searchPlaces: boolean("search_places").notNull().default(false),
    scheduleInterval: text("schedule_interval", {
      enum: ["manual", "weekly", "monthly"],
    })
      .notNull()
      .default("weekly"),
    isActive: boolean("is_active").notNull().default(true),
    nextScanAt: timestampColumn("next_scan_at"),
    archivedAt: timestampColumn("archived_at"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    updatedAt: timestampColumn("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("local_grid_configs_project_active_created_idx").on(
      table.projectId,
      table.isActive,
      table.createdAt,
    ),
    index("local_grid_configs_business_idx").on(table.businessId),
  ],
);

export const localGridKeywords = pgTable(
  "local_grid_keywords",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => localGridConfigs.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("local_grid_keywords_config_keyword_idx").on(
      table.configId,
      table.keyword,
    ),
  ],
);

export const localGridRuns = pgTable(
  "local_grid_runs",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => localGridConfigs.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    taskCount: integer("task_count").notNull().default(0),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    providerCostUsd: real("provider_cost_usd").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestampColumn("started_at").notNull().default(isoNow),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    index("local_grid_runs_config_started_idx").on(
      table.configId,
      table.startedAt,
    ),
    index("local_grid_runs_project_started_idx").on(
      table.projectId,
      table.startedAt,
    ),
    uniqueIndex("local_grid_runs_one_active_per_config_idx")
      .on(table.configId)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const localGridRunPoints = pgTable(
  "local_grid_run_points",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => localGridRuns.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    columnIndex: integer("column_index").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
  },
  (table) => [
    uniqueIndex("local_grid_run_points_run_cell_idx").on(
      table.runId,
      table.rowIndex,
      table.columnIndex,
    ),
  ],
);

export const localGridResults = pgTable(
  "local_grid_results",
  {
    id: text("id").primaryKey(),
    runPointId: text("run_point_id")
      .notNull()
      .references(() => localGridRunPoints.id, { onDelete: "cascade" }),
    trackingKeywordId: text("tracking_keyword_id").notNull(),
    keyword: text("keyword").notNull(),
    providerTaskId: text("provider_task_id"),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    targetRank: integer("target_rank"),
    matchedBy: text("matched_by", {
      enum: ["place_id", "cid", "feature_id", "fallback", "none"],
    }),
    rawResponseKey: text("raw_response_key"),
    providerCostUsd: real("provider_cost_usd").notNull().default(0),
    errorMessage: text("error_message"),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    uniqueIndex("local_grid_results_point_keyword_idx").on(
      table.runPointId,
      table.trackingKeywordId,
    ),
    index("local_grid_results_provider_task_idx").on(table.providerTaskId),
  ],
);

export const localGridRankings = pgTable(
  "local_grid_rankings",
  {
    id: text("id").primaryKey(),
    resultId: text("result_id")
      .notNull()
      .references(() => localGridResults.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    placeId: text("place_id"),
    cid: text("cid"),
    featureId: text("feature_id"),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    website: text("website"),
    primaryCategory: text("primary_category"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
  },
  (table) => [
    uniqueIndex("local_grid_rankings_result_rank_idx").on(
      table.resultId,
      table.rank,
    ),
    index("local_grid_rankings_place_id_idx").on(table.placeId),
    index("local_grid_rankings_cid_idx").on(table.cid),
  ],
);
