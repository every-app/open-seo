import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

// The topic hub's tables on in-memory SQLite, for the query tests: two
// organizations, two projects and one clustered pull in project p-a, plus the
// columns of the AI visibility tables tracking reads.

const MIGRATIONS = [
  "0072_platform_seo_phase1.sql",
  "0075_platform_topics.sql",
  "0076_platform_articles.sql",
  "0077_platform_syndication.sql",
  "0078_platform_tracking.sql",
];

export async function createTopicHubDb() {
  const client = createClient({ url: "file::memory:" });
  const migration = MIGRATIONS.map((file) =>
    readFileSync(
      new URL(`../../../../../drizzle/sqlite/${file}`, import.meta.url),
      "utf8",
    ),
  ).join(";\n");
  await client.executeMultiple(`
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    INSERT INTO organization VALUES ('org-a'), ('org-b');
    CREATE TABLE projects (id TEXT PRIMARY KEY, location_code INTEGER, language_code TEXT);
    INSERT INTO projects VALUES ('p-a', 2840, 'en'), ('p-b', 2840, 'en');
    CREATE TABLE ai_runs (id TEXT PRIMARY KEY, project_id TEXT);
    CREATE TABLE ai_observations (id TEXT PRIMARY KEY, run_id TEXT);
    CREATE TABLE ai_sources (id TEXT PRIMARY KEY, observation_id TEXT, url TEXT, domain TEXT);
    CREATE TABLE keyword_metrics (
      id INTEGER PRIMARY KEY, project_id TEXT, keyword TEXT, location_code INTEGER,
      language_code TEXT, search_volume INTEGER, keyword_difficulty INTEGER
    );
    ${migration.replaceAll("--> statement-breakpoint", "")}
  `);
  return { client, db: drizzle(client) };
}

// Clears every test's rows and puts the shared pull back.
export async function resetTopicHubDb(
  client: Awaited<ReturnType<typeof createTopicHubDb>>["client"],
) {
  await client.executeMultiple(`
    DELETE FROM ps_channels; DELETE FROM ps_topics; DELETE FROM ps_keyword_pulls; DELETE FROM keyword_metrics;
    INSERT INTO ps_keyword_pulls (id, project_id, seed, country, language, location_code, language_code, source, stage, raw_count)
      VALUES ('pull', 'p-a', 'parasite seo', 'GB', 'en', 2826, 'en', 'answersocrates', 'clustered', 3);
    INSERT INTO ps_pulled_keywords (id, pull_id, keyword, "group", relevant) VALUES
      ('k1', 'pull', 'what is parasite seo', 'question', 1),
      ('k2', 'pull', 'is parasite seo the film', 'question', 0);
    INSERT INTO ps_clusters (id, project_id, pull_id, name, dominant_intent, funnel_stage, position)
      VALUES ('c1', 'p-a', 'pull', 'Basics', 'informational', 'tofu', 0);
    INSERT INTO ps_cluster_keywords (id, cluster_id, keyword, intent, funnel_stage) VALUES
      ('ck1', 'c1', 'parasite seo', 'informational', 'tofu'),
      ('ck2', 'c1', 'parasite seo sites', 'informational', 'tofu');
    INSERT INTO keyword_metrics (project_id, keyword, location_code, language_code, search_volume) VALUES
      ('p-a', 'parasite seo', 2826, 'en', 900),
      ('p-a', 'parasite seo', 2840, 'en', 5);
  `);
}
