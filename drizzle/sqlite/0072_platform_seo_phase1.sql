CREATE TABLE `ps_cluster_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_id` text NOT NULL,
	`keyword` text NOT NULL,
	`intent` text NOT NULL,
	`funnel_stage` text NOT NULL,
	FOREIGN KEY (`cluster_id`) REFERENCES `ps_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_cluster_keywords_cluster_keyword_idx` ON `ps_cluster_keywords` (`cluster_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `ps_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`pull_id` text NOT NULL,
	`name` text NOT NULL,
	`dominant_intent` text NOT NULL,
	`funnel_stage` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_id`) REFERENCES `ps_keyword_pulls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ps_clusters_pull_idx` ON `ps_clusters` (`pull_id`);--> statement-breakpoint
CREATE TABLE `ps_keyword_pulls` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`seed` text NOT NULL,
	`seed_meaning` text,
	`country` text NOT NULL,
	`language` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`source` text NOT NULL,
	`stage` text NOT NULL,
	`raw_count` integer NOT NULL,
	`kept_count` integer,
	`pulled_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ps_keyword_pulls_project_pulled_idx` ON `ps_keyword_pulls` (`project_id`,`pulled_at`);--> statement-breakpoint
CREATE TABLE `ps_pulled_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_id` text NOT NULL,
	`keyword` text NOT NULL,
	`group` text NOT NULL,
	`relevant` integer,
	`relevance_reason` text,
	FOREIGN KEY (`pull_id`) REFERENCES `ps_keyword_pulls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_pulled_keywords_pull_keyword_idx` ON `ps_pulled_keywords` (`pull_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `ps_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`cluster_id` text,
	`title` text NOT NULL,
	`angle` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cluster_id`) REFERENCES `ps_clusters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ps_topics_project_status_idx` ON `ps_topics` (`project_id`,`status`);