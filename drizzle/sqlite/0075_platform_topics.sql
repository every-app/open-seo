CREATE TABLE `ps_topic_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`keyword` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `ps_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_topic_keywords_topic_keyword_idx` ON `ps_topic_keywords` (`topic_id`,`keyword`);--> statement-breakpoint
CREATE TABLE `ps_topic_outline_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`position` integer NOT NULL,
	`heading` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`topic_id`) REFERENCES `ps_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_topic_outline_sections_topic_position_idx` ON `ps_topic_outline_sections` (`topic_id`,`position`);--> statement-breakpoint
CREATE TABLE `ps_topic_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`question` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `ps_topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ps_topic_questions_topic_question_idx` ON `ps_topic_questions` (`topic_id`,`question`);--> statement-breakpoint
ALTER TABLE `ps_topics` ADD `pull_id` text REFERENCES ps_keyword_pulls(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ps_topics` ADD `location_code` integer;--> statement-breakpoint
ALTER TABLE `ps_topics` ADD `language_code` text;--> statement-breakpoint
ALTER TABLE `ps_topics` ADD `primary_keyword` text;--> statement-breakpoint
ALTER TABLE `ps_topics` ADD `brief_generated_at` text;--> statement-breakpoint
CREATE INDEX `ps_topics_cluster_idx` ON `ps_topics` (`cluster_id`);--> statement-breakpoint
UPDATE `ps_topics` SET
	`pull_id` = (SELECT `pull_id` FROM `ps_clusters` WHERE `ps_clusters`.`id` = `ps_topics`.`cluster_id`),
	`location_code` = coalesce(
		(SELECT p.`location_code` FROM `ps_clusters` c JOIN `ps_keyword_pulls` p ON p.`id` = c.`pull_id` WHERE c.`id` = `ps_topics`.`cluster_id`),
		(SELECT `location_code` FROM `projects` WHERE `projects`.`id` = `ps_topics`.`project_id`)
	),
	`language_code` = coalesce(
		(SELECT p.`language_code` FROM `ps_clusters` c JOIN `ps_keyword_pulls` p ON p.`id` = c.`pull_id` WHERE c.`id` = `ps_topics`.`cluster_id`),
		(SELECT `language_code` FROM `projects` WHERE `projects`.`id` = `ps_topics`.`project_id`)
	);--> statement-breakpoint
INSERT INTO `ps_topic_keywords` (`id`, `topic_id`, `keyword`)
SELECT lower(hex(randomblob(16))), t.`id`, ck.`keyword`
FROM `ps_topics` t JOIN `ps_cluster_keywords` ck ON ck.`cluster_id` = t.`cluster_id`;