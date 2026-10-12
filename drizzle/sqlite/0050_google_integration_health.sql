CREATE TABLE `google_integration_health` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`integration` text NOT NULL,
	`provider_id` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`account_id` text,
	`last_successful_refresh_at` text,
	`last_refresh_error_at` text,
	`last_refresh_error_class` text,
	`last_refresh_error_code` text,
	`last_refresh_error_suberror` text,
	`last_refresh_error_message` text,
	`consecutive_refresh_failures` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_integration_health_project_integration_idx` ON `google_integration_health` (`project_id`,`integration`);--> statement-breakpoint
CREATE INDEX `google_integration_health_integration_failures_idx` ON `google_integration_health` (`integration`,`consecutive_refresh_failures`,`updated_at`);
