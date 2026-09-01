import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Keep this definition structurally identical to ../ai-search.schema.ts.
export const brandLookupRuns = pgTable(
  "brand_lookup_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    resolvedTarget: text("resolved_target").notNull(),
    scope: text("scope"),
    competitors: text("competitors").notNull().default("[]"),
    totalMentions: integer("total_mentions"),
    totalAiSearchVolume: integer("total_ai_search_volume"),
    shareOfVoicePercent: integer("share_of_voice_percent"),
    payload: text("payload").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("brand_lookup_runs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
