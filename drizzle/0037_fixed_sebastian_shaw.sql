CREATE TABLE `indexing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`url` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`response_body` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `indexing_events_project_created_idx` ON `indexing_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `indexing_events_organization_idx` ON `indexing_events` (`organization_id`);--> statement-breakpoint
CREATE TABLE `indexnow_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`host` text NOT NULL,
	`key` text NOT NULL,
	`key_location` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexnow_configs_project_idx` ON `indexnow_configs` (`project_id`);--> statement-breakpoint
CREATE INDEX `indexnow_configs_organization_idx` ON `indexnow_configs` (`organization_id`);