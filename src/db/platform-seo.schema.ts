import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";
import {
  PS_AI_VERDICTS,
  PS_ARTICLE_STATUSES,
  PS_FUNNEL_STAGES,
  PS_INTENTS,
  PS_KEYWORD_GROUPS,
  PS_PLATFORM_SOURCES,
  PS_PLATFORM_STATUSES,
  PS_PULL_STAGES,
  PS_TOPIC_STATUSES,
} from "@/shared/platform-seo";

// ============================================================================
// Platform SEO: keyword expansion -> clusters -> topics (-> articles ->
// syndication in later phases). Kept in its own module so upstream schema
// changes merge cleanly.
// ============================================================================

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// One Answer Socrates pull for a seed in one market.
export const psKeywordPulls = sqliteTable(
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

export const psPulledKeywords = sqliteTable(
  "ps_pulled_keywords",
  {
    id: text("id").primaryKey(),
    pullId: text("pull_id")
      .notNull()
      .references(() => psKeywordPulls.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    group: text("group", { enum: PS_KEYWORD_GROUPS }).notNull(),
    // Null until the relevance pass has run.
    relevant: integer("relevant", { mode: "boolean" }),
    relevanceReason: text("relevance_reason"),
  },
  (table) => [
    uniqueIndex("ps_pulled_keywords_pull_keyword_idx").on(
      table.pullId,
      table.keyword,
    ),
  ],
);

export const psClusters = sqliteTable(
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
export const psClusterKeywords = sqliteTable(
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

export const psTopics = sqliteTable(
  "ps_topics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Where the topic came from. Re-clustering replaces a pull's clusters, so
    // the topic keeps its own keywords and market rather than reading them
    // through the cluster.
    clusterId: text("cluster_id").references(() => psClusters.id, {
      onDelete: "set null",
    }),
    pullId: text("pull_id").references(() => psKeywordPulls.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    angle: text("angle"),
    status: text("status", { enum: PS_TOPIC_STATUSES }).notNull(),
    // DataForSEO market for the keyword metrics. Nullable only because the
    // columns were added after topics existed; new topics always set them.
    locationCode: integer("location_code"),
    languageCode: text("language_code"),
    // Brief: the keyword the article targets, plus the questions and outline
    // below. Null until "Write this" has run.
    primaryKeyword: text("primary_keyword"),
    briefGeneratedAt: text("brief_generated_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("ps_topics_project_status_idx").on(table.projectId, table.status),
    index("ps_topics_cluster_idx").on(table.clusterId),
  ],
);

// The searches a topic targets. Volume / KD live in keyword_metrics, joined on
// (project, keyword, topic market).
export const psTopicKeywords = sqliteTable(
  "ps_topic_keywords",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => psTopics.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
  },
  (table) => [
    uniqueIndex("ps_topic_keywords_topic_keyword_idx").on(
      table.topicId,
      table.keyword,
    ),
  ],
);

// Brief: real searches (from the pull's Questions group) the article answers.
export const psTopicQuestions = sqliteTable(
  "ps_topic_questions",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => psTopics.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("ps_topic_questions_topic_question_idx").on(
      table.topicId,
      table.question,
    ),
  ],
);

// Brief: the article's sections in order, each with what it should cover.
export const psTopicOutlineSections = sqliteTable(
  "ps_topic_outline_sections",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => psTopics.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    heading: text("heading").notNull(),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("ps_topic_outline_sections_topic_position_idx").on(
      table.topicId,
      table.position,
    ),
  ],
);

// The canonical article for a topic, written in Markdown. One per topic; the
// syndicated copies (later) are derived from it.
export const psArticles = sqliteTable(
  "ps_articles",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => psTopics.id, { onDelete: "cascade" }),
    canonicalTitle: text("canonical_title").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    status: text("status", { enum: PS_ARTICLE_STATUSES }).notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [uniqueIndex("ps_articles_topic_idx").on(table.topicId)],
);

// ----------------------------------------------------------------------------
// Platform discovery. Both tables belong to the organization, so every project
// grows (and benefits from) one list.
// ----------------------------------------------------------------------------

// One site that ranks in Google, keyed by registrable domain (user.medium.com
// and medium.com are one platform). The user's status is the decision; the AI
// fields are its first-pass guess.
export const psPlatforms = sqliteTable(
  "ps_platforms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    status: text("status", { enum: PS_PLATFORM_STATUSES }).notNull(),
    source: text("source", { enum: PS_PLATFORM_SOURCES }).notNull(),
    aiVerdict: text("ai_verdict", { enum: PS_AI_VERDICTS }),
    aiCanProfile: integer("ai_can_profile", { mode: "boolean" }),
    aiCanPost: integer("ai_can_post", { mode: "boolean" }),
    aiReason: text("ai_reason"),
    aiClassifiedAt: text("ai_classified_at"),
    // The first result we saw for it, shown as an example while reviewing.
    exampleKeyword: text("example_keyword"),
    exampleUrl: text("example_url"),
    exampleTitle: text("example_title"),
    bestPosition: integer("best_position"),
    seenCount: integer("seen_count").notNull().default(0),
    firstSeenAt: text("first_seen_at").notNull().default(isoNow),
    lastSeenAt: text("last_seen_at"),
    classifiedAt: text("classified_at"),
    // An affiliate program, whatever else the site is (Skool is both).
    affiliateProgram: integer("affiliate_program", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex("ps_platforms_org_domain_idx").on(
      table.organizationId,
      table.domain,
    ),
    index("ps_platforms_org_status_idx").on(table.organizationId, table.status),
  ],
);

// One organic result from one SERP read the app paid for. runKey identifies
// the read (repeats of it insert nothing), so a keyword's latest run is the
// page as Google last showed it.
export const psSerpObservations = sqliteTable(
  "ps_serp_observations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    runKey: text("run_key").notNull(),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    position: integer("position").notNull(),
    domain: text("domain").notNull(),
    // Identifies one result within a run: domain plus its title or URL.
    resultKey: text("result_key").notNull(),
    url: text("url"),
    title: text("title"),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [
    uniqueIndex("ps_serp_observations_run_result_idx").on(
      table.organizationId,
      table.runKey,
      table.resultKey,
    ),
    index("ps_serp_observations_keyword_idx").on(
      table.organizationId,
      table.keyword,
      table.locationCode,
      table.languageCode,
      table.observedAt,
    ),
  ],
);
