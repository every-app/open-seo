CREATE TABLE `__keyword_metrics_project_guard` (
	`ok` integer NOT NULL,
	CHECK (`ok` = 1)
);--> statement-breakpoint
INSERT INTO `__keyword_metrics_project_guard` (`ok`)
SELECT
	CASE
		WHEN (
			SELECT COUNT(*) FROM `keyword_metrics`
		) = 0 THEN 1
		WHEN (
			SELECT COUNT(*) FROM `projects`
		) = 1 THEN 1
		ELSE 0
	END;--> statement-breakpoint
DROP TABLE `__keyword_metrics_project_guard`;--> statement-breakpoint

ALTER TABLE `keyword_metrics` RENAME TO `keyword_metrics_legacy`;--> statement-breakpoint
CREATE TABLE `keyword_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`search_volume` integer,
	`cpc` real,
	`competition` real,
	`keyword_difficulty` integer,
	`intent` text,
	`monthly_searches` text,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `keyword_metrics` (
	`project_id`,
	`keyword`,
	`location_code`,
	`language_code`,
	`search_volume`,
	`cpc`,
	`competition`,
	`keyword_difficulty`,
	`intent`,
	`monthly_searches`,
	`fetched_at`
)
SELECT
	(
		SELECT `id`
		FROM `projects`
		ORDER BY `created_at` ASC, `id` ASC
		LIMIT 1
	),
	`keyword`,
	`location_code`,
	`language_code`,
	`search_volume`,
	`cpc`,
	`competition`,
	`keyword_difficulty`,
	`intent`,
	`monthly_searches`,
	`fetched_at`
FROM `keyword_metrics_legacy`;--> statement-breakpoint
DROP TABLE `keyword_metrics_legacy`;--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_metrics_unique_project_keyword_location_language` ON `keyword_metrics` (`project_id`,`keyword`,`location_code`,`language_code`);--> statement-breakpoint
CREATE INDEX `keyword_metrics_lookup_idx` ON `keyword_metrics` (`project_id`,`keyword`,`location_code`,`language_code`,`fetched_at`);
