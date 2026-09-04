CREATE TABLE `indexnow_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`public_key` text NOT NULL,
	`key_location` text NOT NULL,
	`key_verified_at` text,
	`generated_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexnow_configs_project_idx` ON `indexnow_configs` (`project_id`);--> statement-breakpoint
CREATE INDEX `indexnow_configs_organization_idx` ON `indexnow_configs` (`organization_id`);--> statement-breakpoint
CREATE TABLE `indexnow_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`config_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_url_count` integer NOT NULL,
	`unique_url_count` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`received_chunk_count` integer NOT NULL,
	`rejected_chunk_count` integer NOT NULL,
	`failed_chunk_count` integer NOT NULL,
	`http_statuses_json` text NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`config_id`) REFERENCES `indexnow_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `indexnow_submissions_project_created_idx` ON `indexnow_submissions` (`project_id`,`created_at`);