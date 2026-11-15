import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";
import {
  PS_FUNNEL_STAGES,
  PS_INTENTS,
  PS_KEYWORD_GROUPS,
  PS_PULL_STAGES,
  PS_TOPIC_STATUSES,
} from "@/shared/platform-seo";

// ============================================================================
// Platform SEO: keyword expansion -> clusters -> topics (-> articles ->
// syndication in later phases). Kept in its own module so upstream schema
// changes merge cleanly.
// ============================================================================

// Text timestamps, same shape as SQLite (see pg/app.schema.ts).
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// One Answer Socrates pull for a seed in one market.
export const psKeywordPulls = pgTable(
  "ps_keyword_pulls",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seed: text("seed").notNull(),
    // Optional user note on what the seed means ("parasite seo = the SEO
    // tactic"), read by the relevance pass.
    seedMeaning: text("seed_meaning"),
    // Answer Socrates market (gl/hl) and the DataForSEO market used to enrich.
    country: text("country").notNull(),
    language: text("language").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    source: text("source", { enum: ["answersocrates"] }).notNull(),
    stage: text("stage", { enum: PS_PULL_STAGES }).notNull(),
    rawCount: integer("raw_count").notNull(),
    keptCount: integer("kept_count"),
    pulledAt: text("pulled_at").notNull().default(isoNow),
  },
  (table) => [
    index("ps_keyword_pulls_project_pulled_idx").on(
      table.projectId,
      table.pulledAt,
    ),
  ],
);

export const psPulledKeywords = pgTable(
  "ps_pulled_keywords",
  {
    id: text("id").primaryKey(),
    pullId: text("pull_id")
      .notNull()
      .references(() => psKeywordPulls.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    group: text("group", { enum: PS_KEYWORD_GROUPS }).notNull(),
    // Null until the relevance pass has run.
    relevant: boolean("relevant"),
    relevanceReason: text("relevance_reason"),
  },
  (table) => [
    uniqueIndex("ps_pulled_keywords_pull_keyword_idx").on(
      table.pullId,
      table.keyword,
    ),
  ],
);

export const psClusters = pgTable(
  "ps_clusters",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    pullId: text("pull_id")
      .notNull()
      .references(() => psKeywordPulls.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dominantIntent: text("dominant_intent", { enum: PS_INTENTS }).notNull(),
    funnelStage: text("funnel_stage", { enum: PS_FUNNEL_STAGES }).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("ps_clusters_pull_idx").on(table.pullId)],
);

// Volume / KD are not copied here: they live in keyword_metrics, joined on
// (project, keyword, market).
export const psClusterKeywords = pgTable(
  "ps_cluster_keywords",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => psClusters.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    intent: text("intent", { enum: PS_INTENTS }).notNull(),
    funnelStage: text("funnel_stage", { enum: PS_FUNNEL_STAGES }).notNull(),
  },
  (table) => [
    uniqueIndex("ps_cluster_keywords_cluster_keyword_idx").on(
      table.clusterId,
      table.keyword,
    ),
  ],
);

export const psTopics = pgTable(
  "ps_topics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    clusterId: text("cluster_id").references(() => psClusters.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    angle: text("angle"),
    status: text("status", { enum: PS_TOPIC_STATUSES }).notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("ps_topics_project_status_idx").on(table.projectId, table.status),
  ],
);
