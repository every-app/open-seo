CREATE TABLE `ps_tracking_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`syndication_id` text NOT NULL,
	`status` text NOT NULL,
	`keyword` text,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`rank_task_id` text,
	`index_task_id` text,
	`indexed` integer,
	`ranked` integer,
	`google_position` integer,
	`ai_cited` integer,
	`requested_at` text NOT NULL,
	`checked_at` text,
	FOREIGN KEY (`syndication_id`) REFERENCES `ps_syndications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ps_tracking_snapshots_syndication_idx` ON `ps_tracking_snapshots` (`syndication_id`,`requested_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ps_tracking_snapshots_one_pending_idx` ON `ps_tracking_snapshots` (`syndication_id`) WHERE status = 'pending';