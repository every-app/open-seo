-- One-time migration helper for duplicate auto-created Default projects.
--
-- Use only if the latest migrations fail with a unique-constraint error for
-- projects_one_default_per_organization_idx. Prefer the TypeScript runner in
-- scripts/d1-default-project-cleanup.ts; it adds dry-run output, active-run
-- preflight checks, validation, and remote confirmation. See
-- docs/default-project-cleanup.md for the full recovery runbook.
--
-- "Newest" matches the app's default project selection. The id tie-breaker is
-- only here to keep this cleanup deterministic when several race-created rows
-- share the same second-level created_at value.
--
-- Do not wrap this file in BEGIN/COMMIT. Remote D1 imports reject explicit
-- transaction statements.

-- Build a small lookup table that describes every merge this script will make:
-- one canonical Default project, plus each duplicate Default project that
-- should be folded into it. Organizations with only one Default project are not
-- inserted here, so the rest of the script naturally ignores them.
DROP TABLE IF EXISTS __default_project_merge;
CREATE TABLE __default_project_merge (
  organization_id text NOT NULL,
  canonical_project_id text NOT NULL,
  duplicate_project_id text PRIMARY KEY NOT NULL
);

INSERT INTO __default_project_merge (
  organization_id,
  canonical_project_id,
  duplicate_project_id
)
WITH ranked_default_projects AS (
  -- Rank Default/null-domain projects within each organization. keep_rank = 1
  -- is the canonical project that survives; keep_rank > 1 rows are duplicate
  -- projects that will be remapped and deleted.
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
)
SELECT
  organization_id,
  canonical_project_id,
  id AS duplicate_project_id
FROM ranked_default_projects
WHERE project_count > 1
  AND keep_rank > 1;

-- Materialize rank config collisions once before any rank tracking rows are
-- changed. This considers every rank config attached to any project in the
-- affected organization merge set. That catches both canonical-vs-duplicate
-- collisions and duplicate-vs-duplicate collisions before the generic project
-- remap can violate the unique index.
--
-- The survivor keeps its config-level settings (devices, schedule, active
-- state, depth, last-check metadata). Duplicate configs contribute their
-- tracked keywords and historical runs, but not their config settings.
DROP TABLE IF EXISTS __rank_config_merge;
CREATE TABLE __rank_config_merge (
  canonical_project_id text NOT NULL,
  duplicate_project_id text NOT NULL,
  canonical_config_id text NOT NULL,
  duplicate_config_id text PRIMARY KEY NOT NULL
);

INSERT INTO __rank_config_merge (
  canonical_project_id,
  duplicate_project_id,
  canonical_config_id,
  duplicate_config_id
)
WITH project_set AS (
  SELECT
    organization_id,
    canonical_project_id,
    canonical_project_id AS project_id,
    1 AS is_canonical_project
  FROM __default_project_merge
  GROUP BY organization_id, canonical_project_id

  UNION ALL

  SELECT
    organization_id,
    canonical_project_id,
    duplicate_project_id AS project_id,
    0 AS is_canonical_project
  FROM __default_project_merge
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
  AND keep_rank > 1;

-- Merge saved keyword tags by normalized name.
--
-- If duplicate and canonical projects both have a tag with the same
-- normalized_name, the canonical tag should survive. If the canonical tag has
-- no explicit color but the duplicate tag does, preserve that color before
-- deleting the duplicate row. Then delete duplicate tag assignments that would
-- become exact assignment duplicates after the tag id is remapped.
UPDATE saved_keyword_tags
SET color = COALESCE(
  color,
  (
    SELECT duplicate_tag.color
    FROM saved_keyword_tags duplicate_tag
    JOIN __default_project_merge merge_map
      ON merge_map.duplicate_project_id = duplicate_tag.project_id
    WHERE merge_map.canonical_project_id = saved_keyword_tags.project_id
      AND duplicate_tag.normalized_name = saved_keyword_tags.normalized_name
      AND duplicate_tag.color IS NOT NULL
    ORDER BY duplicate_tag.created_at DESC, duplicate_tag.id DESC
    LIMIT 1
  )
)
WHERE color IS NULL
  AND EXISTS (
    SELECT 1
    FROM saved_keyword_tags duplicate_tag
    JOIN __default_project_merge merge_map
      ON merge_map.duplicate_project_id = duplicate_tag.project_id
    WHERE merge_map.canonical_project_id = saved_keyword_tags.project_id
      AND duplicate_tag.normalized_name = saved_keyword_tags.normalized_name
      AND duplicate_tag.color IS NOT NULL
  );

DELETE FROM saved_keyword_tag_assignments
WHERE tag_id IN (
  SELECT duplicate_tag.id
  FROM saved_keyword_tags duplicate_tag
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_tag.project_id
  JOIN saved_keyword_tags canonical_tag
    ON canonical_tag.project_id = merge_map.canonical_project_id
   AND canonical_tag.normalized_name = duplicate_tag.normalized_name
)
AND EXISTS (
  SELECT 1
  FROM saved_keyword_tags duplicate_tag
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_tag.project_id
  JOIN saved_keyword_tags canonical_tag
    ON canonical_tag.project_id = merge_map.canonical_project_id
   AND canonical_tag.normalized_name = duplicate_tag.normalized_name
  JOIN saved_keyword_tag_assignments existing_assignment
    ON existing_assignment.saved_keyword_id =
      saved_keyword_tag_assignments.saved_keyword_id
   AND existing_assignment.tag_id = canonical_tag.id
  WHERE duplicate_tag.id = saved_keyword_tag_assignments.tag_id
);

-- Move the remaining assignments from duplicate tag ids to the matching
-- canonical tag ids.
UPDATE saved_keyword_tag_assignments
SET tag_id = (
  SELECT canonical_tag.id
  FROM saved_keyword_tags duplicate_tag
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_tag.project_id
  JOIN saved_keyword_tags canonical_tag
    ON canonical_tag.project_id = merge_map.canonical_project_id
   AND canonical_tag.normalized_name = duplicate_tag.normalized_name
  WHERE duplicate_tag.id = saved_keyword_tag_assignments.tag_id
)
WHERE tag_id IN (
  SELECT duplicate_tag.id
  FROM saved_keyword_tags duplicate_tag
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_tag.project_id
  JOIN saved_keyword_tags canonical_tag
    ON canonical_tag.project_id = merge_map.canonical_project_id
   AND canonical_tag.normalized_name = duplicate_tag.normalized_name
);

-- Delete duplicate tag rows that have now either had their assignments moved or
-- had duplicate assignments removed.
DELETE FROM saved_keyword_tags
WHERE id IN (
  SELECT duplicate_tag.id
  FROM saved_keyword_tags duplicate_tag
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_tag.project_id
  JOIN saved_keyword_tags canonical_tag
    ON canonical_tag.project_id = merge_map.canonical_project_id
   AND canonical_tag.normalized_name = duplicate_tag.normalized_name
);

-- Tags that do not collide by normalized_name can simply move to the canonical
-- project.
UPDATE saved_keyword_tags
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = saved_keyword_tags.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- Merge saved keywords by keyword/location/language.
--
-- If duplicate and canonical projects both saved the same keyword in the same
-- location/language, the canonical saved keyword should survive. First delete
-- tag assignments that would become duplicates after remapping the saved
-- keyword id.
DELETE FROM saved_keyword_tag_assignments
WHERE saved_keyword_id IN (
  SELECT duplicate_keyword.id
  FROM saved_keywords duplicate_keyword
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_keyword.project_id
  JOIN saved_keywords canonical_keyword
    ON canonical_keyword.project_id = merge_map.canonical_project_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
   AND canonical_keyword.location_code = duplicate_keyword.location_code
   AND canonical_keyword.language_code = duplicate_keyword.language_code
)
AND EXISTS (
  SELECT 1
  FROM saved_keywords duplicate_keyword
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_keyword.project_id
  JOIN saved_keywords canonical_keyword
    ON canonical_keyword.project_id = merge_map.canonical_project_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
   AND canonical_keyword.location_code = duplicate_keyword.location_code
   AND canonical_keyword.language_code = duplicate_keyword.language_code
  JOIN saved_keyword_tag_assignments existing_assignment
    ON existing_assignment.saved_keyword_id = canonical_keyword.id
   AND existing_assignment.tag_id = saved_keyword_tag_assignments.tag_id
  WHERE duplicate_keyword.id =
    saved_keyword_tag_assignments.saved_keyword_id
);

-- Move the remaining tag assignments from duplicate saved keyword ids to the
-- matching canonical saved keyword ids.
UPDATE saved_keyword_tag_assignments
SET saved_keyword_id = (
  SELECT canonical_keyword.id
  FROM saved_keywords duplicate_keyword
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_keyword.project_id
  JOIN saved_keywords canonical_keyword
    ON canonical_keyword.project_id = merge_map.canonical_project_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
   AND canonical_keyword.location_code = duplicate_keyword.location_code
   AND canonical_keyword.language_code = duplicate_keyword.language_code
  WHERE duplicate_keyword.id =
    saved_keyword_tag_assignments.saved_keyword_id
)
WHERE saved_keyword_id IN (
  SELECT duplicate_keyword.id
  FROM saved_keywords duplicate_keyword
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_keyword.project_id
  JOIN saved_keywords canonical_keyword
    ON canonical_keyword.project_id = merge_map.canonical_project_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
   AND canonical_keyword.location_code = duplicate_keyword.location_code
   AND canonical_keyword.language_code = duplicate_keyword.language_code
);

-- Delete duplicate saved keyword rows that have now had their tag assignments
-- handled.
DELETE FROM saved_keywords
WHERE id IN (
  SELECT duplicate_keyword.id
  FROM saved_keywords duplicate_keyword
  JOIN __default_project_merge merge_map
    ON merge_map.duplicate_project_id = duplicate_keyword.project_id
  JOIN saved_keywords canonical_keyword
    ON canonical_keyword.project_id = merge_map.canonical_project_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
   AND canonical_keyword.location_code = duplicate_keyword.location_code
   AND canonical_keyword.language_code = duplicate_keyword.language_code
);

-- Saved keywords that do not collide by keyword/location/language can simply
-- move to the canonical project.
UPDATE saved_keywords
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = saved_keywords.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- Merge cached keyword metrics by keyword/location/language.
--
-- keyword_metrics has the same natural key shape as saved_keywords for this
-- cleanup. If the canonical project already has the same metric row, delete the
-- duplicate project's copy before updating project_id.
--
-- These rows are cache/enrichment data for keyword research and saved keywords.
-- Colliding metric rows are derived/cache data and can be refetched, so the
-- canonical row wins and the duplicate row is removed.
DELETE FROM keyword_metrics
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
)
AND EXISTS (
  SELECT 1
  FROM __default_project_merge merge_map
  JOIN keyword_metrics canonical_metric
    ON canonical_metric.project_id = merge_map.canonical_project_id
   AND canonical_metric.keyword = keyword_metrics.keyword
   AND canonical_metric.location_code = keyword_metrics.location_code
   AND canonical_metric.language_code = keyword_metrics.language_code
  WHERE merge_map.duplicate_project_id = keyword_metrics.project_id
);

-- Move all remaining metric rows to the canonical project.
UPDATE keyword_metrics
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = keyword_metrics.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- Merge rank tracking configs that collide by domain/location.
--
-- If duplicate and canonical projects both track the same domain/location, the
-- canonical config should survive. First delete duplicate tracked-keyword rows
-- where the same keyword already exists on the canonical config.

DROP TABLE IF EXISTS __rank_keyword_delete;
CREATE TABLE __rank_keyword_delete (
  duplicate_keyword_id text PRIMARY KEY NOT NULL
);

INSERT INTO __rank_keyword_delete (duplicate_keyword_id)
SELECT duplicate_keyword.id
FROM rank_tracking_keywords duplicate_keyword
JOIN __rank_config_merge config_merge
  ON config_merge.duplicate_config_id = duplicate_keyword.config_id
JOIN rank_tracking_keywords canonical_keyword
  ON canonical_keyword.config_id = config_merge.canonical_config_id
 AND canonical_keyword.keyword = duplicate_keyword.keyword;

-- Historical snapshots intentionally do not FK to rank_tracking_keywords, but
-- the rank-tracking results page groups snapshots by tracking_keyword_id and
-- then maps them back to active keyword rows. Remap snapshots from duplicate
-- keyword ids to canonical keyword ids before deleting duplicate keyword rows
-- so historical positions remain visible after the config merge.
UPDATE rank_snapshots
SET tracking_keyword_id = (
  SELECT canonical_keyword.id
  FROM __rank_config_merge config_merge
  JOIN rank_tracking_keywords duplicate_keyword
    ON duplicate_keyword.config_id = config_merge.duplicate_config_id
  JOIN rank_tracking_keywords canonical_keyword
    ON canonical_keyword.config_id = config_merge.canonical_config_id
   AND canonical_keyword.keyword = duplicate_keyword.keyword
  WHERE duplicate_keyword.id = rank_snapshots.tracking_keyword_id
)
WHERE tracking_keyword_id IN (
  SELECT duplicate_keyword_id FROM __rank_keyword_delete
);

DELETE FROM rank_tracking_keywords
WHERE id IN (
  SELECT duplicate_keyword_id FROM __rank_keyword_delete
);

-- Move non-overlapping tracked keywords from duplicate configs to the matching
-- canonical configs.
UPDATE rank_tracking_keywords
SET config_id = (
  SELECT canonical_config_id
  FROM __rank_config_merge
  WHERE duplicate_config_id = rank_tracking_keywords.config_id
)
WHERE config_id IN (
  SELECT duplicate_config_id FROM __rank_config_merge
);

-- Move historical runs from duplicate configs to the matching canonical configs
-- and canonical project. rank_snapshots stay attached to run_id, so no snapshot
-- rows need to be changed.
UPDATE rank_check_runs
SET
  config_id = (
    SELECT canonical_config_id
    FROM __rank_config_merge
    WHERE duplicate_config_id = rank_check_runs.config_id
  ),
  project_id = (
    SELECT canonical_project_id
    FROM __rank_config_merge
    WHERE duplicate_config_id = rank_check_runs.config_id
  )
WHERE config_id IN (
  SELECT duplicate_config_id FROM __rank_config_merge
);

-- Delete duplicate config rows after their keywords and runs have moved.
-- At this point any useful child history has been moved or remains reachable
-- through rank_check_runs; only the duplicate config row/settings are removed.
DELETE FROM rank_tracking_configs
WHERE id IN (
  SELECT duplicate_config_id FROM __rank_config_merge
);

-- Any remaining rank configs on duplicate projects did not collide by
-- domain/location, so they can move directly to the canonical project.
UPDATE rank_tracking_configs
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = rank_tracking_configs.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- rank_check_runs stores project_id directly, so move those runs to the
-- canonical project. rank_snapshots are linked through run/config ids and do
-- not need a project_id update.
UPDATE rank_check_runs
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = rank_check_runs.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- Audits store project_id directly, so move them to the canonical project.
-- audit_pages and audit_lighthouse_results are linked through audit/page ids,
-- so they do not need direct updates here.
UPDATE audits
SET project_id = (
  SELECT canonical_project_id
  FROM __default_project_merge
  WHERE duplicate_project_id = audits.project_id
)
WHERE project_id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- At this point no supported child rows should point at the duplicate projects,
-- so the extra Default project rows can be removed.
DELETE FROM projects
WHERE id IN (
  SELECT duplicate_project_id FROM __default_project_merge
);

-- Drop the temporary merge map so the database is left with only application
-- tables.
DROP TABLE __rank_keyword_delete;
DROP TABLE __rank_config_merge;
DROP TABLE __default_project_merge;
