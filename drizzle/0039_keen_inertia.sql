CREATE TABLE `psi_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`url_id` text NOT NULL,
	`project_id` text NOT NULL,
	`strategy` text NOT NULL,
	`performance_score` integer,
	`accessibility_score` integer,
	`best_practices_score` integer,
	`seo_score` integer,
	`lcp_ms` real,
	`cls` real,
	`tbt_ms` real,
	`fcp_ms` real,
	`speed_index_ms` real,
	`ttfb_ms` real,
	`field_lcp_ms` real,
	`field_inp_ms` real,
	`field_cls` real,
	`field_overall_category` text,
	`field_source` text,
	`fetch_time` text,
	`error_message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`url_id`) REFERENCES `psi_urls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `psi_snapshots_url_strategy_created_idx` ON `psi_snapshots` (`url_id`,`strategy`,`created_at`);--> statement-breakpoint
CREATE INDEX `psi_snapshots_project_idx` ON `psi_snapshots` (`project_id`);--> statement-breakpoint
CREATE TABLE `psi_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`url` text NOT NULL,
	`is_homepage` integer DEFAULT false NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `psi_urls_project_url_idx` ON `psi_urls` (`project_id`,`url`);--> statement-breakpoint
CREATE INDEX `psi_urls_organization_idx` ON `psi_urls` (`organization_id`);