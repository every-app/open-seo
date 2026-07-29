CREATE TABLE `brand_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`config_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text,
	`url` text,
	`snippet` text,
	`published_at` text,
	`sentiment_score` real,
	`sentiment_label` text,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`config_id`) REFERENCES `brand_monitor_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brand_mentions_source_unique_idx` ON `brand_mentions` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `brand_mentions_config_published_idx` ON `brand_mentions` (`config_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `brand_monitor_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`query` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brand_monitor_configs_project_query_idx` ON `brand_monitor_configs` (`project_id`,`query`);--> statement-breakpoint
CREATE INDEX `brand_monitor_configs_project_active_idx` ON `brand_monitor_configs` (`project_id`,`is_active`);