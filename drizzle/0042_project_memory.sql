CREATE TABLE `project_competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`name` text,
	`notes` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_competitors_project_domain_idx` ON `project_competitors` (`project_id`,`domain`);--> statement-breakpoint
CREATE TABLE `project_context_sections` (
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`project_id`, `key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_key_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`role` text NOT NULL,
	`topic` text,
	`notes` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_key_pages_project_url_idx` ON `project_key_pages` (`project_id`,`url`);--> statement-breakpoint
CREATE TABLE `project_research_log` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`summary` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_research_log_project_date_idx` ON `project_research_log` (`project_id`,`entry_date`);
--> statement-breakpoint
DROP TABLE `sam_project_memory`;
