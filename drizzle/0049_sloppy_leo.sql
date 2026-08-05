CREATE TABLE `bing_ai_citation_days` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`date` text NOT NULL,
	`citations` integer NOT NULL,
	`cited_pages` integer NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bing_ai_citation_days_project_date_idx` ON `bing_ai_citation_days` (`project_id`,`date`);--> statement-breakpoint
CREATE INDEX `bing_ai_citation_days_organization_idx` ON `bing_ai_citation_days` (`organization_id`);--> statement-breakpoint
CREATE TABLE `bing_ai_citation_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`report_type` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`row_count` integer NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bing_ai_citation_snapshots_project_type_idx` ON `bing_ai_citation_snapshots` (`project_id`,`report_type`);--> statement-breakpoint
CREATE INDEX `bing_ai_citation_snapshots_organization_idx` ON `bing_ai_citation_snapshots` (`organization_id`);--> statement-breakpoint
CREATE TABLE `bing_ai_page_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`project_id` text NOT NULL,
	`page` text NOT NULL,
	`citations` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `bing_ai_citation_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bing_ai_page_citations_snapshot_idx` ON `bing_ai_page_citations` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `bing_ai_query_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`project_id` text NOT NULL,
	`query` text NOT NULL,
	`intent` text NOT NULL,
	`topic` text NOT NULL,
	`citations` integer NOT NULL,
	`citation_share_percent` real NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `bing_ai_citation_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bing_ai_query_citations_snapshot_idx` ON `bing_ai_query_citations` (`snapshot_id`);