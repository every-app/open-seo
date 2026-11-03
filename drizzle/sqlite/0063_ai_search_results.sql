CREATE TABLE `ai_search_results` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`snippet` text,
	`published_at` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_search_results_observation_idx` ON `ai_search_results` (`observation_id`);