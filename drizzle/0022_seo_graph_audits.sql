CREATE TABLE `seo_graph_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`started_by_user_id` text NOT NULL,
	`domain` text NOT NULL,
	`keywords_json` text NOT NULL DEFAULT '[]',
	`run_id` text,
	`status` text NOT NULL DEFAULT 'pending',
	`routing_path` text NOT NULL DEFAULT '[]',
	`client_report` text,
	`error_message` text,
	`started_at` text NOT NULL DEFAULT (current_timestamp),
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seo_graph_audits_project_id_idx` ON `seo_graph_audits` (`project_id`);
