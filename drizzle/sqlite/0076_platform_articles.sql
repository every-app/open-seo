CREATE TABLE `ps_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`canonical_title` text NOT NULL,
	`body_markdown` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `ps_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_articles_topic_idx` ON `ps_articles` (`topic_id`);