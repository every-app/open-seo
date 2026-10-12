-- Reconcile any stranded pending/running runs before creating the partial
-- unique index that replaces the rank_check_locks table. With the old
-- lock-table model, at most one active run per config could exist, so this
-- mostly protects against orphaned rows that outlived their locks.
UPDATE `rank_check_runs`
SET
  `status` = 'failed',
  `error_message` = COALESCE(`error_message`, 'Reconciled during lock-table migration'),
  `completed_at` = COALESCE(`completed_at`, CURRENT_TIMESTAMP)
WHERE `status` IN ('pending', 'running');--> statement-breakpoint
DROP TABLE `rank_check_locks`;--> statement-breakpoint
CREATE UNIQUE INDEX `rank_check_runs_one_active_per_config_idx` ON `rank_check_runs` (`config_id`) WHERE "rank_check_runs"."status" IN ('pending', 'running');