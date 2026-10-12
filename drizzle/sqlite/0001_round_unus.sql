DROP INDEX `saved_keywords_unique_project_keyword_location`;--> statement-breakpoint
CREATE UNIQUE INDEX `saved_keywords_unique_project_keyword_location_language` ON `saved_keywords` (`project_id`,`keyword`,`location_code`,`language_code`);--> statement-breakpoint
CREATE INDEX `saved_keywords_project_created_idx` ON `saved_keywords` (`project_id`,`created_at`);--> statement-breakpoint
DELETE FROM `keyword_metrics`
WHERE `id` NOT IN (
  SELECT MAX(`id`)
  FROM `keyword_metrics`
  GROUP BY `keyword`, `location_code`, `language_code`
);--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_metrics_unique_keyword_location_language` ON `keyword_metrics` (`keyword`,`location_code`,`language_code`);--> statement-breakpoint
CREATE INDEX `keyword_metrics_lookup_idx` ON `keyword_metrics` (`keyword`,`location_code`,`language_code`,`fetched_at`);
