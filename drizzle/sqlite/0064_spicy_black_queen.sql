CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`webhook_ciphertext` text NOT NULL,
	`webhook_host` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_channels_project_idx` ON `notification_channels` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`run_id` text NOT NULL,
	`delivered_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `notification_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_rule_run_idx` ON `notification_deliveries` (`rule_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`rank_config_id` text,
	`position_threshold` integer DEFAULT 3 NOT NULL,
	`weekly_summary` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rank_config_id`) REFERENCES `rank_tracking_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_rules_project_idx` ON `notification_rules` (`project_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `notification_rules_config_idx` ON `notification_rules` (`rank_config_id`);