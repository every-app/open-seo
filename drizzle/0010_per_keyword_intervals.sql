ALTER TABLE `rank_tracking_keywords` ADD `schedule_interval_override` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `rank_tracking_keywords` ADD `next_check_at` text;--> statement-breakpoint
CREATE INDEX `rank_tracking_keywords_config_next_check_idx` ON `rank_tracking_keywords` (`config_id`,`next_check_at`);
