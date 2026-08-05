CREATE TABLE `rapidapi_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`captured_on` text NOT NULL,
	`active_subscribers` integer NOT NULL,
	`paying_subscribers` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rapidapi_snapshots_project_day_idx` ON `rapidapi_snapshots` (`project_id`,`captured_on`);--> statement-breakpoint
CREATE INDEX `rapidapi_snapshots_organization_idx` ON `rapidapi_snapshots` (`organization_id`);