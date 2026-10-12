CREATE TABLE `audit_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`url` text NOT NULL,
	`status_code` integer,
	`redirect_url` text,
	`title` text,
	`meta_description` text,
	`canonical_url` text,
	`robots_meta` text,
	`og_title` text,
	`og_description` text,
	`og_image` text,
	`h1_count` integer DEFAULT 0 NOT NULL,
	`h2_count` integer DEFAULT 0 NOT NULL,
	`h3_count` integer DEFAULT 0 NOT NULL,
	`h4_count` integer DEFAULT 0 NOT NULL,
	`h5_count` integer DEFAULT 0 NOT NULL,
	`h6_count` integer DEFAULT 0 NOT NULL,
	`heading_order_json` text,
	`word_count` integer DEFAULT 0 NOT NULL,
	`images_total` integer DEFAULT 0 NOT NULL,
	`images_missing_alt` integer DEFAULT 0 NOT NULL,
	`images_json` text,
	`internal_link_count` integer DEFAULT 0 NOT NULL,
	`external_link_count` integer DEFAULT 0 NOT NULL,
	`has_structured_data` integer DEFAULT false NOT NULL,
	`hreflang_tags_json` text,
	`is_indexable` integer DEFAULT true NOT NULL,
	`response_time_ms` integer,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_pages_audit_id_idx` ON `audit_pages` (`audit_id`);--> statement-breakpoint
CREATE TABLE `audit_psi_results` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`page_id` text NOT NULL,
	`strategy` text NOT NULL,
	`performance_score` integer,
	`accessibility_score` integer,
	`best_practices_score` integer,
	`seo_score` integer,
	`lcp_ms` real,
	`cls` real,
	`inp_ms` real,
	`ttfb_ms` real,
	`error_message` text,
	`r2_key` text,
	`payload_size_bytes` integer,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `audit_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_psi_results_audit_id_idx` ON `audit_psi_results` (`audit_id`);--> statement-breakpoint
CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`start_url` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`workflow_instance_id` text,
	`config` text DEFAULT '{}' NOT NULL,
	`pages_crawled` integer DEFAULT 0 NOT NULL,
	`pages_total` integer DEFAULT 0 NOT NULL,
	`psi_total` integer DEFAULT 0 NOT NULL,
	`psi_completed` integer DEFAULT 0 NOT NULL,
	`psi_failed` integer DEFAULT 0 NOT NULL,
	`current_phase` text DEFAULT 'discovery',
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audits_project_id_idx` ON `audits` (`project_id`);--> statement-breakpoint
CREATE INDEX `audits_user_id_idx` ON `audits` (`user_id`);--> statement-breakpoint
CREATE TABLE `keyword_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`search_volume` integer,
	`cpc` real,
	`competition` real,
	`keyword_difficulty` integer,
	`intent` text,
	`monthly_searches` text,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`pagespeed_api_key` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `psi_audit_results` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`requested_url` text NOT NULL,
	`final_url` text NOT NULL,
	`strategy` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`performance_score` integer,
	`accessibility_score` integer,
	`best_practices_score` integer,
	`seo_score` integer,
	`first_contentful_paint` text,
	`largest_contentful_paint` text,
	`total_blocking_time` text,
	`cumulative_layout_shift` text,
	`speed_index` text,
	`time_to_interactive` text,
	`lighthouse_version` text,
	`error_message` text,
	`r2_key` text,
	`payload_size_bytes` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `psi_audit_results_project_created_idx` ON `psi_audit_results` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `psi_audit_results_project_strategy_idx` ON `psi_audit_results` (`project_id`,`strategy`);--> statement-breakpoint
CREATE TABLE `saved_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`location_code` integer DEFAULT 2840 NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_keywords_unique_project_keyword_location` ON `saved_keywords` (`project_id`,`keyword`,`location_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);