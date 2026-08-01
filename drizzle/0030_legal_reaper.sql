CREATE TABLE `audit_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`page_id` text,
	`page_url` text NOT NULL,
	`issue_type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`details_json` text,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `audit_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_issues_audit_id_idx` ON `audit_issues` (`audit_id`);--> statement-breakpoint
CREATE INDEX `audit_issues_audit_type_idx` ON `audit_issues` (`audit_id`,`issue_type`);--> statement-breakpoint
CREATE TABLE `audit_links` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`source_page_id` text NOT NULL,
	`source_url` text NOT NULL,
	`target_url` text NOT NULL,
	`anchor` text,
	`is_internal` integer DEFAULT true NOT NULL,
	`is_nofollow` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_page_id`) REFERENCES `audit_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_links_audit_id_idx` ON `audit_links` (`audit_id`);--> statement-breakpoint
CREATE INDEX `audit_links_audit_target_idx` ON `audit_links` (`audit_id`,`target_url`);--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `x_robots_tag` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `header_canonical_url` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `crawl_depth` integer;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `in_sitemap` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `audit_pages` ADD `fetch_class` text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_pages_audit_url_idx` ON `audit_pages` (`audit_id`,`url`);