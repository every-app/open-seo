ALTER TABLE `rank_tracking_configs` ADD `location_name` text;--> statement-breakpoint
DROP INDEX `rank_tracking_configs_project_domain_location_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tracking_configs_project_domain_location_name_idx` ON `rank_tracking_configs` (`project_id`,`domain`,`location_code`,`location_name`);
