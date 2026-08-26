CREATE TABLE `paa_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`seed` text NOT NULL,
	`region` text DEFAULT 'US' NOT NULL,
	`question_count` integer,
	`report` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paa_scans_scan_unique` ON `paa_scans` (`scan_id`);--> statement-breakpoint
CREATE INDEX `paa_scans_project_created_idx` ON `paa_scans` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `serper_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`connected_at` text
);
