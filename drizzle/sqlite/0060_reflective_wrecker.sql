CREATE TABLE `local_rank_businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`identity` text NOT NULL,
	`title` text NOT NULL,
	`cid` text,
	`place_id` text,
	`address` text,
	`rating` real,
	`reviews` integer,
	FOREIGN KEY (`scan_id`) REFERENCES `local_rank_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_businesses_scan_identity_idx` ON `local_rank_businesses` (`scan_id`,`identity`);--> statement-breakpoint
CREATE TABLE `local_rank_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`tracker_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracker_id`) REFERENCES `local_rank_trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_rank_checks_tracker_created_idx` ON `local_rank_checks` (`tracker_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_checks_one_active_idx` ON `local_rank_checks` (`tracker_id`) WHERE "local_rank_checks"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE TABLE `local_rank_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`tracker_id` text NOT NULL,
	`keyword` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`tracker_id`) REFERENCES `local_rank_trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_keywords_tracker_keyword_idx` ON `local_rank_keywords` (`tracker_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `local_rank_points` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`row` integer NOT NULL,
	`col` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`status` text NOT NULL,
	`rank` integer,
	`results_count` integer,
	`error` text,
	`collected_at` text,
	FOREIGN KEY (`scan_id`) REFERENCES `local_rank_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_points_scan_position_idx` ON `local_rank_points` (`scan_id`,`row`,`col`);--> statement-breakpoint
CREATE TABLE `local_rank_results` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`business_id` text NOT NULL,
	`rank` integer NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `local_rank_points`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `local_rank_businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_results_point_business_idx` ON `local_rank_results` (`point_id`,`business_id`);--> statement-breakpoint
CREATE INDEX `local_rank_results_business_idx` ON `local_rank_results` (`business_id`);--> statement-breakpoint
CREATE TABLE `local_rank_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`check_id` text NOT NULL,
	`project_id` text NOT NULL,
	`tracker_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`check_id`) REFERENCES `local_rank_checks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracker_id`) REFERENCES `local_rank_trackers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `local_rank_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_rank_scans_tracker_created_idx` ON `local_rank_scans` (`tracker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `local_rank_scans_project_idx` ON `local_rank_scans` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_rank_scans_check_keyword_idx` ON `local_rank_scans` (`check_id`,`keyword_id`);--> statement-breakpoint
CREATE TABLE `local_rank_trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`address` text,
	`cid` text,
	`place_id` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`grid_size` integer NOT NULL,
	`spacing_km` real NOT NULL,
	`language_code` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_rank_trackers_project_idx` ON `local_rank_trackers` (`project_id`);