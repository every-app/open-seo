/**
 * One-time migration helper for duplicate auto-created Default projects.
 *
 * Use only if the latest migrations fail with a unique-constraint error for
 * projects_one_default_per_organization_idx. See
 * docs/default-project-cleanup.md for the full Cloudflare D1 and local D1
 * recovery runbook.
 */

import { execFileSync } from "node:child_process";
import process from "node:process";
import { parseArgs } from "./cli-utils";

const args = parseArgs(process.argv.slice(2));
const databaseName = args.database;
const shouldApply = args.apply === "true";
const confirmedRemoteApply = args["confirm-remote-apply"] === "true";
const validateOnly = args["validate-only"] === "true";
const isLocal = args.local === "true";

const CLEANUP_SQL_FILE = "scripts/cleanup-default-projects.sql";

async function main() {
  console.log(
    `Target: ${databaseName} (${isLocal ? "local" : "remote"} D1 database)`,
  );

  if (validateOnly) {
    runValidation();
    return;
  }

  if (!shouldApply) {
    runDryRun();
    return;
  }

  runPreflightBlockers();

  console.log("\nApplying cleanup SQL...");
  runWrangler(["--yes", "--file", CLEANUP_SQL_FILE]);
  runValidation();
}

function printUsage() {
  console.log(`Usage:
  pnpm cleanup:default-projects:d1 --database <database-name>
  pnpm cleanup:default-projects:d1 --database <database-name> --apply --confirm-remote-apply
  pnpm cleanup:default-projects:d1 --database <database-name> --validate-only

Options:
  --database <name>  Required D1 database binding/name to execute against.
  --apply           Run scripts/cleanup-default-projects.sql, then validate.
  --confirm-remote-apply
                    Required with --apply for remote D1 databases.
  --validate-only   Run post-cleanup validation checks only.
  --local           Target local D1 instead of remote D1.

Dry run is the default. It prints the rows that would be deleted, remapped, or
deduped without mutating application tables.

See docs/default-project-cleanup.md for the full recovery runbook.`);
}

function runDryRun() {
  console.log("\nDry run: duplicate Default project summary");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    )
    SELECT
      COUNT(DISTINCT organization_id) AS organizations_affected,
      COUNT(*) AS duplicate_default_projects_to_delete
    FROM merge_map;
  `);

  console.log("\nDry run: duplicate project rows that would be deleted");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    )
    SELECT
      projects.organization_id,
      projects.id AS duplicate_project_id,
      merge_map.canonical_project_id,
      projects.created_at
    FROM projects
    JOIN merge_map
      ON merge_map.duplicate_project_id = projects.id
    ORDER BY projects.organization_id, projects.created_at DESC, projects.id DESC
    LIMIT 100;
  `);

  console.log("\nDry run: rows that would be deleted as duplicates");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    )
    SELECT
      (SELECT COUNT(*) FROM merge_map) AS duplicate_default_projects,
      (
        SELECT COUNT(*)
        FROM saved_keyword_tags duplicate_tag
        JOIN merge_map
          ON merge_map.duplicate_project_id = duplicate_tag.project_id
        JOIN saved_keyword_tags canonical_tag
          ON canonical_tag.project_id = merge_map.canonical_project_id
         AND canonical_tag.normalized_name = duplicate_tag.normalized_name
      ) AS duplicate_saved_keyword_tags,
      (
        SELECT COUNT(*)
        FROM saved_keywords duplicate_keyword
        JOIN merge_map
          ON merge_map.duplicate_project_id = duplicate_keyword.project_id
        JOIN saved_keywords canonical_keyword
          ON canonical_keyword.project_id = merge_map.canonical_project_id
         AND canonical_keyword.keyword = duplicate_keyword.keyword
         AND canonical_keyword.location_code = duplicate_keyword.location_code
         AND canonical_keyword.language_code = duplicate_keyword.language_code
      ) AS duplicate_saved_keywords,
      (
        SELECT COUNT(*)
        FROM keyword_metrics duplicate_metric
        JOIN merge_map
          ON merge_map.duplicate_project_id = duplicate_metric.project_id
        JOIN keyword_metrics canonical_metric
          ON canonical_metric.project_id = merge_map.canonical_project_id
         AND canonical_metric.keyword = duplicate_metric.keyword
         AND canonical_metric.location_code = duplicate_metric.location_code
         AND canonical_metric.language_code = duplicate_metric.language_code
      ) AS duplicate_keyword_metrics,
      (
        SELECT COUNT(*)
        FROM saved_keyword_tag_assignments assignment
        JOIN saved_keyword_tags duplicate_tag
          ON duplicate_tag.id = assignment.tag_id
        JOIN merge_map
          ON merge_map.duplicate_project_id = duplicate_tag.project_id
        JOIN saved_keyword_tags canonical_tag
          ON canonical_tag.project_id = merge_map.canonical_project_id
         AND canonical_tag.normalized_name = duplicate_tag.normalized_name
        JOIN saved_keyword_tag_assignments existing_assignment
          ON existing_assignment.saved_keyword_id = assignment.saved_keyword_id
         AND existing_assignment.tag_id = canonical_tag.id
      ) AS duplicate_tag_assignments_from_tag_merge,
      (
        SELECT COUNT(*)
        FROM saved_keyword_tag_assignments assignment
        JOIN saved_keywords duplicate_keyword
          ON duplicate_keyword.id = assignment.saved_keyword_id
        JOIN merge_map
          ON merge_map.duplicate_project_id = duplicate_keyword.project_id
        JOIN saved_keywords canonical_keyword
          ON canonical_keyword.project_id = merge_map.canonical_project_id
         AND canonical_keyword.keyword = duplicate_keyword.keyword
         AND canonical_keyword.location_code = duplicate_keyword.location_code
         AND canonical_keyword.language_code = duplicate_keyword.language_code
        JOIN saved_keyword_tag_assignments existing_assignment
          ON existing_assignment.saved_keyword_id = canonical_keyword.id
         AND existing_assignment.tag_id = assignment.tag_id
      ) AS duplicate_tag_assignments_from_keyword_merge;
  `);

  console.log("\nDry run: rows that would be remapped without deletion");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    ),
    rank_config_merge AS (
      ${rankConfigMergeSql}
    )
    SELECT
      (
        SELECT COUNT(*)
        FROM saved_keyword_tags
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
          AND id NOT IN (
            SELECT duplicate_tag.id
            FROM saved_keyword_tags duplicate_tag
            JOIN merge_map
              ON merge_map.duplicate_project_id = duplicate_tag.project_id
            JOIN saved_keyword_tags canonical_tag
              ON canonical_tag.project_id = merge_map.canonical_project_id
             AND canonical_tag.normalized_name = duplicate_tag.normalized_name
          )
      ) AS saved_keyword_tags_remapped,
      (
        SELECT COUNT(*)
        FROM saved_keywords
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
          AND id NOT IN (
            SELECT duplicate_keyword.id
            FROM saved_keywords duplicate_keyword
            JOIN merge_map
              ON merge_map.duplicate_project_id = duplicate_keyword.project_id
            JOIN saved_keywords canonical_keyword
              ON canonical_keyword.project_id = merge_map.canonical_project_id
             AND canonical_keyword.keyword = duplicate_keyword.keyword
             AND canonical_keyword.location_code = duplicate_keyword.location_code
             AND canonical_keyword.language_code = duplicate_keyword.language_code
          )
      ) AS saved_keywords_remapped,
      (
        SELECT COUNT(*)
        FROM keyword_metrics
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
          AND id NOT IN (
            SELECT duplicate_metric.id
            FROM keyword_metrics duplicate_metric
            JOIN merge_map
              ON merge_map.duplicate_project_id = duplicate_metric.project_id
            JOIN keyword_metrics canonical_metric
              ON canonical_metric.project_id = merge_map.canonical_project_id
             AND canonical_metric.keyword = duplicate_metric.keyword
             AND canonical_metric.location_code = duplicate_metric.location_code
             AND canonical_metric.language_code = duplicate_metric.language_code
          )
      ) AS keyword_metrics_remapped,
      (
        SELECT COUNT(*)
        FROM rank_tracking_configs
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
          AND id NOT IN (SELECT duplicate_config_id FROM rank_config_merge)
      ) AS rank_tracking_configs_remapped,
      (
        SELECT COUNT(*)
        FROM rank_check_runs
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
      ) AS rank_check_runs_remapped,
      (
        SELECT COUNT(*)
        FROM audits
        WHERE project_id IN (SELECT duplicate_project_id FROM merge_map)
      ) AS audits_remapped;
  `);

  console.log("\nDry run: rank tracking config merges");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    ),
    rank_config_merge AS (
      ${rankConfigMergeSql}
    )
    SELECT
      duplicate_config.project_id AS duplicate_project_id,
      rank_config_merge.canonical_project_id,
      duplicate_config.id AS duplicate_config_id,
      canonical_config.id AS canonical_config_id,
      duplicate_config.domain,
      duplicate_config.location_code,
      duplicate_config.created_at AS duplicate_created_at,
      canonical_config.created_at AS canonical_created_at
    FROM rank_config_merge
    JOIN rank_tracking_configs duplicate_config
      ON duplicate_config.id = rank_config_merge.duplicate_config_id
    JOIN rank_tracking_configs canonical_config
      ON canonical_config.id = rank_config_merge.canonical_config_id
    ORDER BY duplicate_config.domain, duplicate_config.location_code
    LIMIT 100;
  `);

  console.log("\nDry run: rank tracking keyword merge counts");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    ),
    rank_config_merge AS (
      ${rankConfigMergeSql}
    )
    SELECT
      (
        SELECT COUNT(*)
        FROM rank_tracking_keywords duplicate_keyword
        JOIN rank_config_merge
          ON rank_config_merge.duplicate_config_id = duplicate_keyword.config_id
        JOIN rank_tracking_keywords canonical_keyword
          ON canonical_keyword.config_id = rank_config_merge.canonical_config_id
         AND canonical_keyword.keyword = duplicate_keyword.keyword
      ) AS rank_tracking_keywords_deleted_as_duplicate,
      (
        SELECT COUNT(*)
        FROM rank_tracking_keywords duplicate_keyword
        JOIN rank_config_merge
          ON rank_config_merge.duplicate_config_id = duplicate_keyword.config_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM rank_tracking_keywords canonical_keyword
          WHERE canonical_keyword.config_id = rank_config_merge.canonical_config_id
            AND canonical_keyword.keyword = duplicate_keyword.keyword
        )
      ) AS rank_tracking_keywords_moved_without_delete,
      (
        SELECT COUNT(*)
        FROM rank_check_runs
        JOIN rank_config_merge
          ON rank_config_merge.duplicate_config_id = rank_check_runs.config_id
      ) AS rank_check_runs_moved_to_canonical_config;
  `);

  console.log("\nDry run: active rank run merge blockers");
  runQuery(`
    WITH ranked_default_projects AS (
      ${rankedDefaultProjectsSql}
    ),
    merge_map AS (
      ${mergeMapSql}
    ),
    rank_config_merge AS (
      ${rankConfigMergeSql}
    )
    SELECT
      config_merge.duplicate_config_id,
      config_merge.canonical_config_id,
      duplicate_run.id AS duplicate_active_run_id,
      canonical_run.id AS canonical_active_run_id,
      duplicate_run.status AS duplicate_status,
      canonical_run.status AS canonical_status
    FROM rank_config_merge config_merge
    JOIN rank_check_runs duplicate_run
      ON duplicate_run.config_id = config_merge.duplicate_config_id
     AND duplicate_run.status IN ('pending', 'running')
    JOIN rank_check_runs canonical_run
      ON canonical_run.config_id = config_merge.canonical_config_id
     AND canonical_run.status IN ('pending', 'running')
    LIMIT 100;
  `);

  console.log("\nDry run: Default project predicate outliers");
  runQuery(defaultProjectOutlierSql);

  console.log("\nDry run complete. Re-run with --apply to mutate the DB.");
}

function runPreflightBlockers() {
  assertNoRows(
    "active rank run merge blockers",
    `
      WITH ranked_default_projects AS (
        ${rankedDefaultProjectsSql}
      ),
      merge_map AS (
        ${mergeMapSql}
      ),
      rank_config_merge AS (
        ${rankConfigMergeSql}
      )
      SELECT
        config_merge.duplicate_config_id,
        config_merge.canonical_config_id,
        duplicate_run.id AS duplicate_active_run_id,
        canonical_run.id AS canonical_active_run_id,
        duplicate_run.status AS duplicate_status,
        canonical_run.status AS canonical_status
      FROM rank_config_merge config_merge
      JOIN rank_check_runs duplicate_run
        ON duplicate_run.config_id = config_merge.duplicate_config_id
       AND duplicate_run.status IN ('pending', 'running')
      JOIN rank_check_runs canonical_run
        ON canonical_run.config_id = config_merge.canonical_config_id
       AND canonical_run.status IN ('pending', 'running');
    `,
  );
}

function runValidation() {
  assertAllZero(
    "duplicate Default projects",
    `
      SELECT COUNT(*) AS organizations_with_duplicate_default_projects
      FROM (
        SELECT organization_id
        FROM projects
        WHERE name = 'Default' AND domain IS NULL
        GROUP BY organization_id
        HAVING COUNT(*) > 1
      );
    `,
  );

  assertAllZero("Default project predicate outliers", defaultProjectOutlierSql);

  assertAllZero(
    "project-owned orphan rows",
    `
      SELECT
        (SELECT COUNT(*) FROM saved_keywords LEFT JOIN projects ON projects.id = saved_keywords.project_id WHERE projects.id IS NULL) AS orphaned_saved_keywords,
        (SELECT COUNT(*) FROM saved_keyword_tags LEFT JOIN projects ON projects.id = saved_keyword_tags.project_id WHERE projects.id IS NULL) AS orphaned_saved_keyword_tags,
        (SELECT COUNT(*) FROM keyword_metrics LEFT JOIN projects ON projects.id = keyword_metrics.project_id WHERE projects.id IS NULL) AS orphaned_keyword_metrics,
        (SELECT COUNT(*) FROM rank_tracking_configs LEFT JOIN projects ON projects.id = rank_tracking_configs.project_id WHERE projects.id IS NULL) AS orphaned_rank_tracking_configs,
        (SELECT COUNT(*) FROM rank_check_runs LEFT JOIN projects ON projects.id = rank_check_runs.project_id WHERE projects.id IS NULL) AS orphaned_rank_check_runs,
        (SELECT COUNT(*) FROM audits LEFT JOIN projects ON projects.id = audits.project_id WHERE projects.id IS NULL) AS orphaned_audits;
    `,
  );

  assertAllZero(
    "uniqueness conflicts",
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM (
            SELECT project_id, keyword, location_code, language_code
            FROM saved_keywords
            GROUP BY project_id, keyword, location_code, language_code
            HAVING COUNT(*) > 1
          )
        ) AS duplicate_saved_keyword_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT project_id, normalized_name
            FROM saved_keyword_tags
            GROUP BY project_id, normalized_name
            HAVING COUNT(*) > 1
          )
        ) AS duplicate_saved_keyword_tag_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT project_id, keyword, location_code, language_code
            FROM keyword_metrics
            GROUP BY project_id, keyword, location_code, language_code
            HAVING COUNT(*) > 1
          )
        ) AS duplicate_keyword_metric_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT project_id, domain, location_code
            FROM rank_tracking_configs
            GROUP BY project_id, domain, location_code
            HAVING COUNT(*) > 1
          )
        ) AS duplicate_rank_config_keys,
        (
          SELECT COUNT(*)
          FROM (
            SELECT config_id, keyword
            FROM rank_tracking_keywords
            GROUP BY config_id, keyword
            HAVING COUNT(*) > 1
          )
        ) AS duplicate_rank_tracking_keyword_keys;
    `,
  );

  assertAllZero(
    "saved keyword tag assignment integrity",
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM saved_keyword_tag_assignments assignment
          LEFT JOIN saved_keywords
            ON saved_keywords.id = assignment.saved_keyword_id
          WHERE saved_keywords.id IS NULL
        ) AS assignments_with_missing_saved_keyword,
        (
          SELECT COUNT(*)
          FROM saved_keyword_tag_assignments assignment
          LEFT JOIN saved_keyword_tags
            ON saved_keyword_tags.id = assignment.tag_id
          WHERE saved_keyword_tags.id IS NULL
        ) AS assignments_with_missing_tag,
        (
          SELECT COUNT(*)
          FROM saved_keyword_tag_assignments assignment
          JOIN saved_keywords
            ON saved_keywords.id = assignment.saved_keyword_id
          JOIN saved_keyword_tags
            ON saved_keyword_tags.id = assignment.tag_id
          WHERE saved_keywords.project_id != saved_keyword_tags.project_id
        ) AS cross_project_tag_assignments;
    `,
  );

  assertAllZero(
    "rank tracking references",
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM rank_check_runs
          LEFT JOIN rank_tracking_configs
            ON rank_tracking_configs.id = rank_check_runs.config_id
          WHERE rank_tracking_configs.id IS NULL
        ) AS runs_with_missing_config,
        (
          SELECT COUNT(*)
          FROM rank_snapshots
          LEFT JOIN rank_check_runs
            ON rank_check_runs.id = rank_snapshots.run_id
          WHERE rank_check_runs.id IS NULL
        ) AS snapshots_with_missing_run;
    `,
  );

  assertNoRows("PRAGMA foreign_key_check", "PRAGMA foreign_key_check;");
  console.log("\nValidation passed.");
}

const rankedDefaultProjectsSql = `
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY created_at DESC, id DESC
    ) AS keep_rank,
    FIRST_VALUE(id) OVER (
      PARTITION BY organization_id
      ORDER BY created_at DESC, id DESC
    ) AS canonical_project_id,
    COUNT(*) OVER (PARTITION BY organization_id) AS project_count
  FROM projects
  WHERE name = 'Default'
    AND domain IS NULL
`;

const mergeMapSql = `
  SELECT
    organization_id,
    canonical_project_id,
    id AS duplicate_project_id
  FROM ranked_default_projects
  WHERE project_count > 1
    AND keep_rank > 1
`;

const rankConfigMergeSql = `
  WITH project_set AS (
    SELECT
      organization_id,
      canonical_project_id,
      canonical_project_id AS project_id,
      1 AS is_canonical_project
    FROM merge_map
    GROUP BY organization_id, canonical_project_id

    UNION ALL

    SELECT
      organization_id,
      canonical_project_id,
      duplicate_project_id AS project_id,
      0 AS is_canonical_project
    FROM merge_map
  ),
  ranked_configs AS (
    SELECT
      project_set.organization_id,
      project_set.canonical_project_id,
      config.project_id,
      config.id AS config_id,
      FIRST_VALUE(config.id) OVER (
        PARTITION BY project_set.organization_id, config.domain, config.location_code
        ORDER BY project_set.is_canonical_project DESC, config.created_at DESC, config.id DESC
      ) AS canonical_config_id,
      COUNT(*) OVER (
        PARTITION BY project_set.organization_id, config.domain, config.location_code
      ) AS config_count,
      ROW_NUMBER() OVER (
        PARTITION BY project_set.organization_id, config.domain, config.location_code
        ORDER BY project_set.is_canonical_project DESC, config.created_at DESC, config.id DESC
      ) AS keep_rank
    FROM rank_tracking_configs config
    JOIN project_set
      ON project_set.project_id = config.project_id
  )
  SELECT
    canonical_project_id,
    project_id AS duplicate_project_id,
    canonical_config_id,
    config_id AS duplicate_config_id
  FROM ranked_configs
  WHERE config_count > 1
    AND keep_rank > 1
`;

const defaultProjectOutlierSql = `
  SELECT
    (
      SELECT COUNT(*)
      FROM projects
      WHERE lower(name) = 'default'
        AND name != 'Default'
    ) AS lowercase_default_name_rows,
    (
      SELECT COUNT(*)
      FROM projects
      WHERE name = 'Default'
        AND domain = ''
    ) AS empty_domain_default_rows;
`;

function runQuery(sql: string) {
  runWrangler(["--command", sql]);
}

type WranglerJsonResult = Array<{
  results?: Array<Record<string, unknown>>;
  success?: boolean;
}>;

function assertAllZero(label: string, sql: string) {
  const rows = runJsonQuery(sql);
  const row = rows[0] ?? {};
  console.log(`\nValidation: ${label}`);
  console.table([row]);

  const failures = Object.entries(row).filter(([, value]) => value !== 0);
  if (failures.length > 0) {
    throw new Error(
      `Validation failed for ${label}: ${failures
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ")}`,
    );
  }
}

function assertNoRows(label: string, sql: string) {
  const rows = runJsonQuery(sql);
  console.log(`\nValidation: ${label}`);
  if (rows.length > 0) {
    console.table(rows);
    throw new Error(`Validation failed for ${label}: expected no rows.`);
  }
  console.log("No rows.");
}

function runJsonQuery(sql: string) {
  const scopeArg = isLocal ? "--local" : "--remote";
  const output = execFileSync(
    "wrangler",
    ["d1", "execute", databaseName, scopeArg, "--json", "--command", sql],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  const parsed = JSON.parse(output) as WranglerJsonResult;
  const failed = parsed.find((result) => result.success === false);
  if (failed) {
    throw new Error(`Wrangler query failed for ${databaseName}.`);
  }
  return parsed.flatMap((result) => result.results ?? []);
}

function runWrangler(extraArgs: string[]) {
  const scopeArg = isLocal ? "--local" : "--remote";
  execFileSync(
    "wrangler",
    ["d1", "execute", databaseName, scopeArg, ...extraArgs],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
}

if (args.help === "true") {
  printUsage();
  process.exit(0);
}

if (!databaseName) {
  printUsage();
  throw new Error("Missing required --database <name> argument.");
}

if (shouldApply && validateOnly) {
  throw new Error("Use either --apply or --validate-only, not both.");
}

if (shouldApply && !isLocal && !confirmedRemoteApply) {
  throw new Error(
    "Remote apply requires --confirm-remote-apply. Run a dry run and make sure you have a D1 backup/time-travel restore point first.",
  );
}

await main();
