CREATE TABLE `brand_lookup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`query` text NOT NULL,
	`resolved_target` text NOT NULL,
	`scope` text,
	`competitors` text DEFAULT '[]' NOT NULL,
	`total_mentions` integer,
	`total_ai_search_volume` integer,
	`share_of_voice_percent` integer,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brand_lookup_runs_project_created_idx` ON `brand_lookup_runs` (`project_id`,`created_at`);