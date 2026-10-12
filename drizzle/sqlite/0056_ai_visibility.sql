CREATE TABLE `ai_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`own` integer NOT NULL,
	`mentioned` integer NOT NULL,
	`cited` integer NOT NULL,
	`first_mention` integer,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_matches_observation_domain_idx` ON `ai_matches` (`observation_id`,`domain`);--> statement-breakpoint
CREATE TABLE `ai_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`engine` text NOT NULL,
	`branded` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`collected_at` text,
	`answer_markdown` text,
	`error` text,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_observations_run_prompt_engine_idx` ON `ai_observations` (`run_id`,`prompt_id`,`engine`);--> statement-breakpoint
CREATE INDEX `ai_observations_prompt_idx` ON `ai_observations` (`prompt_id`);--> statement-breakpoint
CREATE TABLE `ai_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`tracker_id` text NOT NULL,
	`topic` text NOT NULL,
	`text` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tracker_id`) REFERENCES `ai_trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_prompts_tracker_idx` ON `ai_prompts` (`tracker_id`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tracker_id` text NOT NULL,
	`project_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`tracker_id`) REFERENCES `ai_trackers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_runs_project_created_idx` ON `ai_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_runs_one_active_idx` ON `ai_runs` (`tracker_id`) WHERE "ai_runs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE TABLE `ai_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_sources_observation_idx` ON `ai_sources` (`observation_id`);--> statement-breakpoint
CREATE TABLE `ai_trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`chatgpt` integer DEFAULT true NOT NULL,
	`gemini` integer DEFAULT false NOT NULL,
	`google_ai_overview` integer DEFAULT false NOT NULL,
	`location_code` integer DEFAULT 2840 NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`schedule_interval` text DEFAULT 'weekly' NOT NULL,
	`next_check_at` text,
	`last_skip_reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_trackers_project_idx` ON `ai_trackers` (`project_id`);--> statement-breakpoint
CREATE INDEX `ai_trackers_due_idx` ON `ai_trackers` (`enabled`,`next_check_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `ai_research_keywords` text;