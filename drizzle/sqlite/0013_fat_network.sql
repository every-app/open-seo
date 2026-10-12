CREATE TABLE `saved_keyword_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_keyword_tags_project_normalized_name_idx` ON `saved_keyword_tags` (`project_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `saved_keyword_tags_project_name_idx` ON `saved_keyword_tags` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `saved_keyword_tag_assignments` (
	`saved_keyword_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`saved_keyword_id`) REFERENCES `saved_keywords`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `saved_keyword_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_keyword_tag_assignments_unique_idx` ON `saved_keyword_tag_assignments` (`saved_keyword_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `saved_keyword_tag_assignments_keyword_idx` ON `saved_keyword_tag_assignments` (`saved_keyword_id`);--> statement-breakpoint
CREATE INDEX `saved_keyword_tag_assignments_tag_idx` ON `saved_keyword_tag_assignments` (`tag_id`);
