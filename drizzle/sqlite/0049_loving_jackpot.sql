CREATE TABLE `seo_history_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`source` text DEFAULT 'mcp' NOT NULL,
	`payload` text NOT NULL,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seo_history_snapshots_project_kind_captured_idx` ON `seo_history_snapshots` (`project_id`,`kind`,`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `seo_history_snapshots_project_kind_period_idx` ON `seo_history_snapshots` (`project_id`,`kind`,`period_start`) WHERE "seo_history_snapshots"."period_start" IS NOT NULL;