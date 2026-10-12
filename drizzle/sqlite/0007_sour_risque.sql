CREATE TABLE `rank_check_locks` (
	`config_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`acquired_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `rank_tracking_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_check_locks_run_idx` ON `rank_check_locks` (`run_id`);--> statement-breakpoint
CREATE TABLE `rank_check_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`keywords_total` integer DEFAULT 0 NOT NULL,
	`keywords_checked` integer DEFAULT 0 NOT NULL,
	`is_subset_run` integer DEFAULT false NOT NULL,
	`error_message` text,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`config_id`) REFERENCES `rank_tracking_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_check_runs_config_idx` ON `rank_check_runs` (`config_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `rank_check_runs_project_idx` ON `rank_check_runs` (`project_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `rank_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`tracking_keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`device` text NOT NULL,
	`position` integer,
	`url` text,
	`serp_features` text,
	`checked_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `rank_check_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_snapshots_run_idx` ON `rank_snapshots` (`run_id`);--> statement-breakpoint
CREATE INDEX `rank_snapshots_keyword_device_idx` ON `rank_snapshots` (`tracking_keyword_id`,`device`,`checked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `rank_snapshots_run_keyword_device_idx` ON `rank_snapshots` (`run_id`,`tracking_keyword_id`,`device`);--> statement-breakpoint
CREATE TABLE `rank_tracking_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`location_code` integer DEFAULT 2840 NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`devices` text DEFAULT 'both' NOT NULL,
	`schedule_interval` text DEFAULT 'weekly' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`next_check_at` text,
	`last_skip_reason` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tracking_configs_project_domain_location_idx` ON `rank_tracking_configs` (`project_id`,`domain`,`location_code`);--> statement-breakpoint
CREATE TABLE `rank_tracking_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`keyword` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `rank_tracking_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_tracking_keywords_config_keyword_idx` ON `rank_tracking_keywords` (`config_id`,`keyword`);