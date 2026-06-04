CREATE TABLE `gsc_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`site_url` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`connected_account_email` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gsc_connections_project_idx` ON `gsc_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `gsc_connections_organization_idx` ON `gsc_connections` (`organization_id`);--> statement-breakpoint
ALTER TABLE `user_onboarding_answers` ADD `gsc_nudge_dismissed_at` text;