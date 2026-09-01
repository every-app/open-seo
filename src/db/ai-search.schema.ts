import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";

// A saved snapshot of one Brand Lookup run.
//
// Brand Lookup is a PAID fan-out to several DataForSEO LLM-mentions endpoints,
// and its only prior memory was a 24h R2 cache plus a localStorage list of
// queries. That made the two things this feature is actually for impossible:
// seeing past runs from another browser, and comparing a run to the last one.
// Persisting the whole result means history survives the cache, follows the
// project rather than the browser, and can be re-opened without re-charging.
//
// The headline metrics are lifted into typed columns so a trend can be read
// without parsing every payload; `payload` keeps the full result for re-render.
export const brandLookupRuns = sqliteTable(
  "brand_lookup_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Exactly as typed by the user, so a saved run can be re-run identically.
    query: text("query").notNull(),
    // What the lookup actually resolved to (hostname, or hostname + path).
    resolvedTarget: text("resolved_target").notNull(),
    // Null for keyword lookups, which have no URL to scope.
    scope: text("scope"),
    // JSON array of competitor inputs. Part of the run's identity: the same
    // brand with a different competitor set is a different (separately paid) run.
    competitors: text("competitors").notNull().default("[]"),
    // Nullable because a run can legitimately return no data for a target.
    totalMentions: integer("total_mentions"),
    totalAiSearchVolume: integer("total_ai_search_volume"),
    // Our own Share of Voice as a percentage, when competitors were supplied.
    shareOfVoicePercent: integer("share_of_voice_percent"),
    // The complete BrandLookupResult as JSON, so a past run re-renders from
    // storage instead of being re-fetched and re-charged.
    payload: text("payload").notNull(),
    // When the underlying data was fetched, per the result itself.
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // Serves the only read: this project's runs, newest first.
    index("brand_lookup_runs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
