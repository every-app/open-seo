CREATE TABLE `domain_overview_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` text NOT NULL,
	`domain` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`organic_traffic` real,
	`organic_keywords` integer,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `domain_overview_snapshots_lookup_idx` ON `domain_overview_snapshots` (`organization_id`,`domain`,`location_code`,`language_code`,`id`);