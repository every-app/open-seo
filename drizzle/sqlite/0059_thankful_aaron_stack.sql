DROP INDEX `rank_tracking_configs_national_idx`;--> statement-breakpoint
DROP INDEX `rank_tracking_configs_local_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tracking_configs_national_idx` ON `rank_tracking_configs` (`project_id`,`domain`,`location_code`,`language_code`) WHERE "rank_tracking_configs"."location_name" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tracking_configs_local_idx` ON `rank_tracking_configs` (`project_id`,`domain`,`location_code`,`language_code`,`location_name`) WHERE "rank_tracking_configs"."location_name" IS NOT NULL;