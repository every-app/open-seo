CREATE TABLE `content_execution_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`target_url` text,
	`status` text DEFAULT 'ready_to_assign' NOT NULL,
	`owner` text,
	`due_date` text,
	`jira_issue_key` text,
	`jira_issue_url` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_execution_items_project_updated_idx` ON `content_execution_items` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `content_execution_keyword_assignments` (
	`execution_item_id` text NOT NULL,
	`saved_keyword_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`execution_item_id`) REFERENCES `content_execution_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`saved_keyword_id`) REFERENCES `saved_keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_execution_keyword_assignment_pair_idx` ON `content_execution_keyword_assignments` (`execution_item_id`,`saved_keyword_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_execution_keyword_one_page_idx` ON `content_execution_keyword_assignments` (`saved_keyword_id`);--> statement-breakpoint
CREATE INDEX `content_execution_keyword_item_idx` ON `content_execution_keyword_assignments` (`execution_item_id`);