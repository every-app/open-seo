CREATE TABLE `agent_marketplace_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`unique_viewers` integer DEFAULT 0 NOT NULL,
	`clones` integer DEFAULT 0 NOT NULL,
	`unique_cloners` integer DEFAULT 0 NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`oauth_starts` integer DEFAULT 0 NOT NULL,
	`oauth_completions` integer DEFAULT 0 NOT NULL,
	`activated_accounts` integer DEFAULT 0 NOT NULL,
	`qualified_outcomes` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `agent_marketplace_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_marketplace_evidence_listing_captured_idx` ON `agent_marketplace_evidence` (`listing_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `agent_marketplace_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`package_version` text,
	`listing_url` text,
	`submitted_at` text,
	`published_at` text,
	`last_verified_at` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_marketplace_listings_project_platform_idx` ON `agent_marketplace_listings` (`project_id`,`platform`);--> statement-breakpoint
CREATE INDEX `agent_marketplace_listings_project_status_idx` ON `agent_marketplace_listings` (`project_id`,`status`);