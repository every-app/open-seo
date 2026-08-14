CREATE TABLE `competitor_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`keyword_key` text NOT NULL,
	`keywords_json` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`items_json` text NOT NULL,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_snapshots_lookup_idx` ON `competitor_snapshots` (`project_id`,`keyword_key`,`location_code`,`language_code`,`fetched_at`);