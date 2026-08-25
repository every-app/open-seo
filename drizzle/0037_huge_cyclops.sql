CREATE TABLE `local_businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`place_id` text,
	`cid` text,
	`feature_id` text,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`website` text,
	`primary_category` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`rating` real,
	`review_count` integer,
	`last_refreshed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_businesses_project_created_idx` ON `local_businesses` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_businesses_project_place_id_idx` ON `local_businesses` (`project_id`,`place_id`) WHERE "local_businesses"."place_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `local_businesses_project_cid_idx` ON `local_businesses` (`project_id`,`cid`) WHERE "local_businesses"."cid" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `local_grid_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`center_latitude` real NOT NULL,
	`center_longitude` real NOT NULL,
	`grid_size` integer DEFAULT 7 NOT NULL,
	`radius_meters` integer DEFAULT 4828 NOT NULL,
	`distance_unit` text DEFAULT 'mi' NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`se_domain` text DEFAULT 'google.co.uk' NOT NULL,
	`search_depth` integer DEFAULT 20 NOT NULL,
	`search_places` integer DEFAULT false NOT NULL,
	`schedule_interval` text DEFAULT 'weekly' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`next_scan_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `local_businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_grid_configs_project_active_created_idx` ON `local_grid_configs` (`project_id`,`is_active`,`created_at`);--> statement-breakpoint
CREATE INDEX `local_grid_configs_business_idx` ON `local_grid_configs` (`business_id`);--> statement-breakpoint
CREATE TABLE `local_grid_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`keyword` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `local_grid_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_grid_keywords_config_keyword_idx` ON `local_grid_keywords` (`config_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `local_grid_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`rank` integer NOT NULL,
	`place_id` text,
	`cid` text,
	`feature_id` text,
	`name` text NOT NULL,
	`address` text,
	`phone` text,
	`website` text,
	`primary_category` text,
	`latitude` real,
	`longitude` real,
	`rating` real,
	`review_count` integer,
	FOREIGN KEY (`result_id`) REFERENCES `local_grid_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_grid_rankings_result_rank_idx` ON `local_grid_rankings` (`result_id`,`rank`);--> statement-breakpoint
CREATE INDEX `local_grid_rankings_place_id_idx` ON `local_grid_rankings` (`place_id`);--> statement-breakpoint
CREATE INDEX `local_grid_rankings_cid_idx` ON `local_grid_rankings` (`cid`);--> statement-breakpoint
CREATE TABLE `local_grid_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_point_id` text NOT NULL,
	`tracking_keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`provider_task_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_rank` integer,
	`matched_by` text,
	`raw_response_key` text,
	`provider_cost_usd` real DEFAULT 0 NOT NULL,
	`error_message` text,
	`completed_at` text,
	FOREIGN KEY (`run_point_id`) REFERENCES `local_grid_run_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_grid_results_point_keyword_idx` ON `local_grid_results` (`run_point_id`,`tracking_keyword_id`);--> statement-breakpoint
CREATE INDEX `local_grid_results_provider_task_idx` ON `local_grid_results` (`provider_task_id`);--> statement-breakpoint
CREATE TABLE `local_grid_run_points` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`column_index` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `local_grid_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_grid_run_points_run_cell_idx` ON `local_grid_run_points` (`run_id`,`row_index`,`column_index`);--> statement-breakpoint
CREATE TABLE `local_grid_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`task_count` integer DEFAULT 0 NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`provider_cost_usd` real DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`config_id`) REFERENCES `local_grid_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_grid_runs_config_started_idx` ON `local_grid_runs` (`config_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `local_grid_runs_project_started_idx` ON `local_grid_runs` (`project_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_grid_runs_one_active_per_config_idx` ON `local_grid_runs` (`config_id`) WHERE "local_grid_runs"."status" IN ('pending', 'running');