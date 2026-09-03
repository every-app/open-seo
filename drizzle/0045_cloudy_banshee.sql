CREATE TABLE `clarity_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`encrypted_api_token` text NOT NULL,
	`token_hint` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clarity_connections_project_idx` ON `clarity_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `clarity_connections_organization_idx` ON `clarity_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `clarity_report_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`report_kind` text NOT NULL,
	`num_of_days` integer NOT NULL,
	`connection_id` text NOT NULL,
	`response_json` text NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `clarity_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clarity_report_cache_report_idx` ON `clarity_report_cache` (`project_id`,`report_kind`,`num_of_days`);--> statement-breakpoint
CREATE INDEX `clarity_report_cache_project_idx` ON `clarity_report_cache` (`project_id`);--> statement-breakpoint
CREATE INDEX `clarity_report_cache_fetched_at_idx` ON `clarity_report_cache` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `clarity_report_refresh_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`report_kind` text NOT NULL,
	`num_of_days` integer NOT NULL,
	`connection_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`error_code` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `clarity_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clarity_report_refresh_lease_report_idx` ON `clarity_report_refresh_leases` (`project_id`,`report_kind`,`num_of_days`);--> statement-breakpoint
CREATE INDEX `clarity_report_refresh_lease_project_idx` ON `clarity_report_refresh_leases` (`project_id`);--> statement-breakpoint
CREATE INDEX `clarity_report_refresh_lease_expires_at_idx` ON `clarity_report_refresh_leases` (`expires_at`);