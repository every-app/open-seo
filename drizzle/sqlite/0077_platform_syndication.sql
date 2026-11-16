CREATE TABLE `ps_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`display_name` text NOT NULL,
	`publication_id` text,
	`account_url` text,
	`token_ciphertext` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ps_channels_org_idx` ON `ps_channels` (`organization_id`);--> statement-breakpoint
CREATE TABLE `ps_syndication_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`syndication_id` text NOT NULL,
	`tag` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`syndication_id`) REFERENCES `ps_syndications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_syndication_tags_syndication_tag_idx` ON `ps_syndication_tags` (`syndication_id`,`tag`);--> statement-breakpoint
CREATE TABLE `ps_syndications` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`platform_title` text NOT NULL,
	`platform_summary` text,
	`platform_body` text NOT NULL,
	`ai_disclosure` text,
	`status` text NOT NULL,
	`remote_id` text,
	`live_url` text,
	`published_at` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `ps_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `ps_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_syndications_article_channel_idx` ON `ps_syndications` (`article_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `ps_syndications_channel_idx` ON `ps_syndications` (`channel_id`);--> statement-breakpoint
ALTER TABLE `ps_articles` ADD `canonical_url` text;