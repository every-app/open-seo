import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { LocalPointStatus, LocalScanStatus } from "@/shared/local-seo";

export const localRankTrackers = sqliteTable(
  "local_rank_trackers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    address: text("address"),
    cid: text("cid"),
    placeId: text("place_id"),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    gridSize: integer("grid_size").notNull(),
    spacingKm: real("spacing_km").notNull(),
    languageCode: text("language_code").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("local_rank_trackers_project_idx").on(t.projectId)],
);

export const localRankKeywords = sqliteTable(
  "local_rank_keywords",
  {
    id: text("id").primaryKey(),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => localRankTrackers.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    archivedAt: text("archived_at"),
  },
  (t) => [
    uniqueIndex("local_rank_keywords_tracker_keyword_idx").on(
      t.trackerId,
      t.keyword,
    ),
  ],
);

export const localRankChecks = sqliteTable(
  "local_rank_checks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => localRankTrackers.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        LocalScanStatus.Queued,
        LocalScanStatus.Running,
        LocalScanStatus.Completed,
        LocalScanStatus.Partial,
        LocalScanStatus.Failed,
      ],
    }).notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("local_rank_checks_tracker_created_idx").on(t.trackerId, t.createdAt),
    uniqueIndex("local_rank_checks_one_active_idx")
      .on(t.trackerId)
      .where(sql`${t.status} IN ('queued', 'running')`),
  ],
);

export const localRankScans = sqliteTable(
  "local_rank_scans",
  {
    id: text("id").primaryKey(),
    checkId: text("check_id")
      .notNull()
      .references(() => localRankChecks.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => localRankTrackers.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id")
      .notNull()
      .references(() => localRankKeywords.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        LocalScanStatus.Queued,
        LocalScanStatus.Running,
        LocalScanStatus.Completed,
        LocalScanStatus.Partial,
        LocalScanStatus.Failed,
      ],
    }).notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("local_rank_scans_tracker_created_idx").on(t.trackerId, t.createdAt),
    index("local_rank_scans_project_idx").on(t.projectId),
    uniqueIndex("local_rank_scans_check_keyword_idx").on(
      t.checkId,
      t.keywordId,
    ),
  ],
);

export const localRankPoints = sqliteTable(
  "local_rank_points",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => localRankScans.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    status: text("status", {
      enum: [
        LocalPointStatus.Pending,
        LocalPointStatus.Completed,
        LocalPointStatus.Failed,
      ],
    }).notNull(),
    rank: integer("rank"),
    resultsCount: integer("results_count"),
    error: text("error"),
    collectedAt: text("collected_at"),
  },
  (t) => [
    uniqueIndex("local_rank_points_scan_position_idx").on(
      t.scanId,
      t.row,
      t.col,
    ),
  ],
);

// One business snapshot per scan; point rankings reference it rather than
// duplicating profile data at every coordinate.
export const localRankBusinesses = sqliteTable(
  "local_rank_businesses",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => localRankScans.id, { onDelete: "cascade" }),
    identity: text("identity").notNull(),
    title: text("title").notNull(),
    cid: text("cid"),
    placeId: text("place_id"),
    address: text("address"),
    rating: real("rating"),
    reviews: integer("reviews"),
  },
  (t) => [
    uniqueIndex("local_rank_businesses_scan_identity_idx").on(
      t.scanId,
      t.identity,
    ),
  ],
);

export const localRankResults = sqliteTable(
  "local_rank_results",
  {
    id: text("id").primaryKey(),
    pointId: text("point_id")
      .notNull()
      .references(() => localRankPoints.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => localRankBusinesses.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
  },
  (t) => [
    uniqueIndex("local_rank_results_point_business_idx").on(
      t.pointId,
      t.businessId,
    ),
    // Deleting a scan's businesses cascades through this column.
    index("local_rank_results_business_idx").on(t.businessId),
  ],
);
