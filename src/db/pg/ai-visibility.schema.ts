import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// One tracker per project. Brand name, domain and competitors come from the
// project and its competitors when each answer is matched.
export const aiTrackers = pgTable(
  "ai_trackers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    chatgpt: boolean("chatgpt").notNull().default(true),
    gemini: boolean("gemini").notNull().default(false),
    claude: boolean("claude").notNull().default(false),
    perplexity: boolean("perplexity").notNull().default(false),
    googleAiOverview: boolean("google_ai_overview").notNull().default(false),
    locationCode: integer("location_code").notNull().default(2840),
    languageCode: text("language_code").notNull().default("en"),
    scheduleInterval: text("schedule_interval", {
      enum: ["daily", "weekly", "monthly"],
    })
      .notNull()
      .default("weekly"),
    nextCheckAt: text("next_check_at"),
    lastSkipReason: text("last_skip_reason"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("ai_trackers_project_idx").on(t.projectId),
    index("ai_trackers_due_idx").on(t.enabled, t.nextCheckAt),
  ],
);

// Prompt text never changes: an edit archives the prompt and adds a new one,
// so stored answers always belong to the exact text they were collected for.
export const aiPrompts = pgTable(
  "ai_prompts",
  {
    id: text("id").primaryKey(),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => aiTrackers.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    text: text("text").notNull(),
    paused: boolean("paused").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ai_prompts_tracker_idx").on(t.trackerId)],
);

// A partial unique index allows one queued or running check per tracker, like
// rank_check_runs. A failed INSERT is the "already running" signal.
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => aiTrackers.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trigger: text("trigger", {
      enum: ["baseline", "scheduled", "manual"],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "partial", "failed"],
    })
      .notNull()
      .default("queued"),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("ai_runs_project_created_idx").on(t.projectId, t.createdAt),
    uniqueIndex("ai_runs_one_active_idx")
      .on(t.trackerId)
      .where(sql`${t.status} IN ('queued', 'running')`),
  ],
);

// One answer per prompt and engine in a run. Rows are created pending when the
// run starts, so the run's size is its row count.
export const aiObservations = pgTable(
  "ai_observations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => aiPrompts.id, { onDelete: "cascade" }),
    engine: text("engine", {
      enum: ["chatgpt", "gemini", "google_ai_overview", "claude", "perplexity"],
    }).notNull(),
    // Whether the prompt names the project's own brand when the run started.
    branded: boolean("branded").notNull(),
    status: text("status", { enum: ["pending", "completed", "failed"] })
      .notNull()
      .default("pending"),
    collectedAt: text("collected_at"),
    // Null on a completed row means the engine gave no answer.
    answerMarkdown: text("answer_markdown"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("ai_observations_run_prompt_engine_idx").on(
      t.runId,
      t.promptId,
      t.engine,
    ),
    index("ai_observations_prompt_idx").on(t.promptId),
  ],
);

// Pages an answer cites, in the engine's order.
export const aiSources = pgTable(
  "ai_sources",
  {
    id: text("id").primaryKey(),
    observationId: text("observation_id")
      .notNull()
      .references(() => aiObservations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    position: integer("position").notNull(),
  },
  (t) => [index("ai_sources_observation_idx").on(t.observationId)],
);

// Each brand's result in one answer. Name and domain are copied from the
// project when the answer is matched, so later edits never rewrite history.
export const aiMatches = pgTable(
  "ai_matches",
  {
    id: text("id").primaryKey(),
    observationId: text("observation_id")
      .notNull()
      .references(() => aiObservations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    own: boolean("own").notNull(),
    mentioned: boolean("mentioned").notNull(),
    cited: boolean("cited").notNull(),
    // Character offset of the first mention in the answer's plain text.
    firstMention: integer("first_mention"),
  },
  (t) => [
    uniqueIndex("ai_matches_observation_domain_idx").on(
      t.observationId,
      t.domain,
    ),
  ],
);
