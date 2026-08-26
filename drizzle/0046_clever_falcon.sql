CREATE TABLE `content_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`url` text NOT NULL,
	`keyword` text NOT NULL,
	`region` text DEFAULT 'US' NOT NULL,
	`score` integer,
	`grade` text,
	`classify_job_id` text,
	`page_category` text,
	`report` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_scans_job_unique` ON `content_scans` (`job_id`);--> statement-breakpoint
CREATE INDEX `content_scans_project_created_idx` ON `content_scans` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `onpage_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`connected_at` text
);
